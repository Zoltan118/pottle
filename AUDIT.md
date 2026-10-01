# pottle security review

pottle has had **no third-party audit** yet. this file is our own review, done before the mainnet
deploy: what the contract guarantees, how we checked it, what it trusts, and what can still go
wrong. if you find something that is not here, see [`SECURITY.md`](SECURITY.md).

## what the contract guarantees

- money in a pot can only ever go to two places: **the organiser**, once the goal is hit, or **back to
  the address that paid it in**
- refunds open when the deadline passes below the goal, or when a pot that hit its goal **still has
  not paid out 30 days after its deadline** (see "a frozen organiser" below)
- during beta a pot on mainnet never holds more than **100 of its currency** ($100 or €100). the goal is capped at
  100 and a chip-in that would take the pot past 100 is refused, so the most any single pot can ever
  put at risk is 100. the testnet runs the same contract, cap included
- nobody can move money any other way. there is no owner, no admin, no pause, no upgrade and no fee.
  the deployer has no powers after deployment
- a signed chip-in cannot be redirected. the eip-3009 nonce commits to the pot id, the name and a salt,
  and the token signature commits to the payer, the contract and the amount. whoever submits it (our
  relayer or anyone else) can only do exactly what the payer signed
- a refund that fails for one person (for example a blocklisted address) does not block the others.
  that person keeps a claimable balance
- a transfer that does not happen is never counted: if the token refuses or reports failure, the whole
  chip-in, payout or claim reverts and nothing is recorded
- **every pot can always finish.** goals and chip-ins are whole cents, so a pot below its goal always has
  room for one more chip-in under the cap. (before the review, one chip-in of $1.000001 could leave a
  $100 pot a fraction of a cent short forever)
- **nothing is free to spam.** `refundAll` reverts when it would refund nobody, so no sponsor can be
  made to pay for a call that does nothing
- **once anyone has had money back, the pot only refunds.** a late payout can no longer hand the organiser
  the shares of people who had not claimed yet
- **the status tells the truth.** a pot whose refunds are open never reads "reached", and one with
  nothing left in it reads "refunded", so the app and the settle job skip it

## how it was checked

| check | result |
| --- | --- |
| unit and fuzz tests (`forge test`) | 44 tests pass (8 of them added for the review's findings), including a 1,000-run fuzz of money conservation, signature binding across pots, names, amounts and currencies, a hostile token that tries to re-enter, and a token that returns `false` instead of reverting |
| invariant testing | 256 runs of random sequences (create, chip in, time passes, pay out, refund all, claim) across four people and both currencies, 15,360 calls. after every step, six invariants hold: the contract holds **exactly** what it still owes in each currency, every unpaid pot's total equals the sum of its contributors, no pot is above the 100 cap, every pot below its goal can still be finished, the status never contradicts the refund rule, and no pot that has refunded anyone ever pays out |
| coverage (`forge coverage`) | **100%** of lines, statements, branches and functions in `Pottle.sol` |
| static analysis (slither 0.11.4) | 6 findings, none exploitable. see below |
| end to end on arc testnet | 15 checks with real usdc through the running app (`web/scripts/e2e-testnet.mjs`) |

### slither findings

| finding | verdict |
| --- | --- |
| reentrancy in `refundAll`: state written after the token transfer | not exploitable. it is the deliberate "put the balance back if this refund transfer fails" path; the tokens are circle's usdc and eurc, which cannot call back, and every state-changing function is behind a reentrancy lock (proven by the hostile-token test) |
| external calls in a loop (`refundAll`) | by design: capped at 100 contributors, and each transfer is isolated so one failure cannot stop the rest |
| block timestamp comparisons (4) | by design: deadlines are days long; validators can shift a timestamp by seconds |

## what it trusts

- **circle, as issuer of usdc and eurc.** circle can freeze or blocklist addresses, and can pause the
  token entirely, which would stall every pot until it resumes
- **the chain.** arc is run by a permissioned set of validators
- **dynamic**, for email sign-in. embedded wallets are dynamic's; pottle never sees a private key
- **the website.** a compromised frontend could ask you to sign a payment for a different pot or amount.
  your wallet shows the amount and the contract; the pot id is inside the signed nonce

## known limits

- **a frozen organiser.** if the organiser's address is blocklisted after the goal is hit, the payout
  keeps failing. the contract lets everyone take their money back 30 days after the deadline,
  and pays the organiser instead if the freeze is lifted before anyone does. once one person has had
  money back, the pot only refunds (enforced on chain since the review). the thirty days are there
  so a freeze made by mistake and lifted after a review does not cost the organiser a pot they won.
- **tokens sent straight to the contract** (not through a chip-in) belong to no pot and cannot be
  recovered. there is no owner who could return them, by design
- **names are not verified.** the name next to a chip-in is whatever the payer typed
- **a pot can be filled with dust.** at most 100 contributors per pot, so someone could add 100
  separate $0.01 chip-ins from 100 wallets to lock others out. it costs them money and gains nothing
- **overpaying is allowed, up to the cap.** anything above the goal goes to the organiser with the rest,
  but no pot takes in more than 100
- **limits**: deadlines at most 90 days out, pots at most 100 during beta (a new contract lifts it later;
  this one cannot change), names 24 bytes and titles 64 bytes
  (the app trims longer text so it never fails on chain)

## the app and its servers

- **the relayer** pays network fees so friends only sign. it holds a little usdc for gas and never
  holds pot money. it can only submit what people signed, or call `release` and `refundAll`, which
  anyone can call. every transaction is simulated first. it sponsors chip-ins of 1.00 or more whose
  signature stays valid at least two more minutes, checks a whole request before it counts against
  anyone's limits, and counts a wallet's daily limit only for chip-ins that actually verify (so nobody
  can use up someone else's). it sponsors a payout or refund only for a pot that is really due and has
  money in it, once a minute per pot. it keeps a $2 reserve that chip-ins and cash outs cannot touch
  and a $0.30 floor under which it sends nothing, and retries once when two transactions collide on a
  nonce. one signed authorization is broadcast once: a copy that arrives while the first is in flight
  is refused. if it declines a chip-in, the app pays from the user's own wallet. a leaked relayer key
  could spend its gas money and nothing else
- **cash outs through the relayer** (an eip-3009 `transferWithAuthorization` the owner signed) are only
  sponsored for a signed-in pottle account sending from one of its own wallets, from $1 or €1, ten a day
  per account rather than per wallet, so making fresh wallets earns nothing. it refuses to send to the
  pottle contract, the token contracts, circle's cctp contract, the zero address or the sender itself.
  if it declines, the app says pottle can't cover the fee right now instead of charging the wallet
- **cash out in the browser** keeps one signed transfer per cash out and reuses it on a retry, so an
  error after sending can never turn into a second transfer; if the relayer's copy fails because the
  same transfer already landed, the token's `authorizationState` shows it went through. once a
  transaction exists the screen shows it and never offers to send again. through base, the fee is read
  again just before the burn and the send stops if it rose past what the review showed, at least $1
  must arrive, and "all" keeps back today's gas for the two arc transactions
- **face id sign-in** is a passkey that signs the person in, and that dynamic's servers ask for
  (step-up) before a key is added to or removed from the account. it does not guard payments: see the
  october review below. recovery codes are shown once and marked as seen at once, so they can't be
  fetched again later, and there is no way in pottle to make new ones. the card lists every passkey
  with its device and date, so one nobody here added stands out
- **the settle job** (`/api/cron/settle`) is protected by a secret compared in constant time, only to
  stop strangers spending the relayer's gas; the functions it calls are permissionless anyway. it reads
  every pot, skips the ones with nothing to do, starts each run at a different place so a pot that keeps
  failing can never hold the others up, and runs from github every ten minutes with a daily vercel cron
  as a backup
- **the testnet drip** is switched off on mainnet, checks the user's dynamic session, records a payout
  before sending it so two simultaneous requests cannot both be paid, and is rate limited
- **the onramp** only creates a circle session for the signed-in user's own wallet, and only while the
  add money button is on screen
- **headers**: pottle cannot be embedded in another site (stops clickjacking the pay button), with
  nosniff, a strict referrer policy, no plugins, no `<base>` rewriting and no form posts elsewhere.
  scripts are not locked to a list: dynamic's sign-in and circle's onramp load their own, and a policy
  that broke sign-in would do more harm. text from the chain (titles, names) is always rendered as text,
  never as html, and invisible or direction-changing characters are stripped before it is shown
- **the pay sheet** works in whole cents, freezes the amounts it offers while it is open, shows the
  wallet a pot pays out to, and only says "you're in" for a chip-in that succeeded on chain. the
  one-signature nonce is computed in the browser, not taken from an rpc, and a retry reuses the first
  signature rather than making a second valid one
- rate limits are kept per server instance, so they slow a spammer rather than stop a determined one;
  the hard limits are the $1 sponsor minimum and the reserve

## dependencies

`npm audit` for the shipped app reports **0 vulnerabilities**. sign-in moved from dynamic's popup sdk to
its headless sdk (`@dynamic-labs-sdk/client` and `/evm`, pinned to an exact version), which removed 253
packages, including the solana connector whose `bigint-buffer` accounted for every high finding before.
the headless sdk only downloads when someone signs in, or when a device that was signed in comes back.

## independent review, september 2026

before the mainnet deploy the whole codebase went through an adversarial review: seven specialist
hunters (contract money flows, liveness, signatures, the relayer, sign-in and api routes, the website,
secrets and operations), every finding proven with a failing test or a real request, and each one
checked by three independent verifiers trying to disprove it. 36 findings survived: 5 high, 9 medium,
11 low, 11 informational. **none let anyone take pot money or send it anywhere other than the organiser
or the people who paid in.** the high ones were ways to stop a $100 pot from ever finishing and ways to
make the relayer pay for transactions that do nothing.

every finding that code can fix is fixed, in the contract (whole cents, no-op refunds revert, no payout
once refunds start, honest statuses) and in the app (the relayer, the settle job, the pay sheet, sign-in
checks, text from the chain, headers and ci). what remains is accepted on purpose:

- **no script allow-list** in the content security policy, for the reason under headers above
- **per-instance rate limits.** serverless instances do not share memory, so the testnet drip's
  one-a-day rule and the relayer's per-visitor limits are best effort. the hard limits are on chain
  (whole cents, no free no-ops) and in the relayer's reserve and floor
- **keys.** the testnet uses one key for every role, and it was once printed in a local session log.
  it holds only test dollars and is being rotated. mainnet uses fresh keys, a separate deployer and
  relayer, never printed

## review of cash out, receive and passkeys, october 2026

the features added after that review (cash out on arc and through base, receive, passkeys, the new
account sheet) were reviewed by three independent reviewers: the relayer and
servers, the money flows in the browser, and sign-in and passkeys. every finding was fixed or is
listed below.

fixed:

- **sybil gas drain through cash outs (high).** anyone could chain cash outs between fresh wallets,
  each with its own daily limit. cash outs now need a signed-in pottle account and count against the
  account
- **one payload broadcast many times (high).** copies of the same signed authorization arriving at
  once each passed simulation, so the relayer paid for the reverts. an authorization in flight is now
  claimed, and copies are refused
- **a retry after an error could send twice (high).** cash out now reuses the signed transfer, checks
  `authorizationState`, and shows a sent transaction instead of re-enabling send
- **the fee charged could exceed the fee shown (medium).** the base route now stops if circle's fee rose
- **"pottle pays the fee" was not always true (medium).** the wallet no longer pays silently when the
  relayer declines a cash out, and arc cash outs start at $1, where sponsoring starts
- **a fixed 2 cent gas reserve (medium)** became today's gas price for generous amounts, doubled
- **recovery codes left pending could be fetched by any session (medium).** they are marked as seen
  when shown, and pottle no longer reads them back
- smaller ones: circle's cctp contract and the zero address added to the blocked recipients in the
  browser too, simulation errors no longer echoed raw, the testnet eurc bonus can't turn a sent drip
  into an error, sign-out finishes before the next sign-in starts, close is disabled while a cash out
  is being sent, a mistyped network setting is reported instead of quietly meaning testnet

**a face id lock on payments was planned and taken out.** the idea was that anyone who adds a passkey
must pass face id before every payment, enforced by dynamic's servers, while everyone else pays as
before. checked from a real session against dynamic's servers, that can't be expressed: with passkey
enrollment "not required", dynamic protects signing for everyone, and people without a passkey fall back
to an email code before every payment (making a pot failed until signing was taken off the protected
list). a face id check only in pottle's pages would be skippable, so pottle doesn't offer one. the
passkey stays as face id sign-in and as the guard on adding and removing keys. the same run showed
recovery codes refused on an account without a second factor; the part that asked an email code for
extra permissions didn't complete (the code was rejected as stale), so it shows nothing either way

accepted on purpose:

- **per-instance limits.** the in-flight claim, the reserve check and the per-account limit live in
  each serverless instance's memory, so a determined attacker spread across instances gets more than
  the limits say. sponsoring now needs a signed-in account, which makes that costly; a shared store is
  the next step if abuse shows up
- **email is the key to the wallet.** without a lock on payments, whoever controls someone's email can
  sign in and spend their wallet, as with any email sign-in wallet. a pot's money is not at risk (only
  the organiser can be paid, and only by the contract), and in beta a pot holds at most $100
- **a passkey added by someone with your email first.** someone who controls your email can add their
  own passkey before you do, and you can't remove it without a passkey or a recovery code. the card
  lists every passkey with its device and date so it is visible

## pre-mainnet review, october 2026

just before the mainnet deploy, four more independent reviews: the contract one last time, everything
that switches between testnet and mainnet, the changes since the previous review, and a product pass for
what a user or a reviewer would expect and not find.

**the contract:** nothing that could lose, lock or misdirect money. 45 tests pass, `Pottle.sol` stays at
100% coverage, the wrap change has no side effects (same storage layout, no event carries it, an unknown
value renders the default), arc's usdc precompile behaves as a normal token for every call pottle makes,
and both mainnet tokens were checked on chain (code, name, version 2, 6 decimals, not paused). the deploy
script now refuses a key that isn't the expected deployer, so a mainnet run can't quietly use the
testnet key, and checks both tokens before deploying.

fixed in the app:

- **"add" on mainnet** showed the test site's free test dollars when card payments are off. it now says
  to withdraw from an exchange on arc and shows the address
- **the settle job** used one secret for both sites; each site now has its own. a run now fails, so
  github emails about it, when a payout or refund fails, pots go unread, or the relayer drops under $2
- **an unset network** on a live deployment quietly meant testnet; it now shows "not set up"
- **card payments on mainnet** ignore a sandbox widget url, and a malformed one switches them off
  instead of breaking the page
- **one rpc**: the settle job and the relayer now try an rpc of pottle's own first (ARC_RPC_URL) and
  fall back to arc's public one
- **face id sign-in** only shows when dynamic offers passkey sign-in too, passkeys are removed one per
  tap so a recovery code works, and a dashboard that protects wallet signing is warned about
- **navigation from the account sheet** waited for the sheet's own history step, so a tap on a pot can't
  bounce back
- **privacy and search**: pot pages (which carry people's names) and the whole test site are kept out of
  search results; names are marked public where they're typed
- **old test links** on pottle.xyz point to the test site instead of a stranger's mainnet pot
- **an about page** (`/about`): who runs pottle, what is stored where, the risks, the terms in short,
  and how to reach the developer; plus faq answers on cancelling, losing access, and pottle disappearing
- smaller ones: coinbase copy, "refunded to you" only once it is, birthday guesses from numbers only
  next to a person, wrap lists typed so a typo fails the build

open, by design or for later: email remains the key to a wallet (see above), organisers get no
notification when a pot pays out (they see it on the pot and in their balance), and payout and refund
transactions aren't linked from the pot page yet.

