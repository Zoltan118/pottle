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
  put at risk is 100. the testnet contract is the version before this cap, with goals up to 10,000
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
  money in it, once a minute per pot. it keeps a $2 reserve that chip-ins cannot touch and a $0.30
  floor under which it sends nothing, and retries once when two transactions collide on a nonce. if it
  declines or cannot send, the app pays from the user's own wallet. a leaked relayer key could spend its gas money and nothing else
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

`npm audit` for the shipped app reports 8 high findings, all one chain: `bigint-buffer`, which has no
fixed version, inside the solana connector of dynamic's sdk. pottle never uses solana. the other 24
findings (axios, uuid, stream-json, sharp, all under dynamic) are fixed by version overrides in
`web/package.json`. we are on dynamic's latest release; npm's suggested fix, downgrading dynamic to
1.x, would be worse.

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
