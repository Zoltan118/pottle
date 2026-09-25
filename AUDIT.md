# pottle security review

pottle has **not had an outside audit**. this file is our own review, done before the mainnet
deploy: what the contract guarantees, how we checked it, what it trusts, and what can still go
wrong. if you find something that is not here, see [`SECURITY.md`](SECURITY.md).

## what the contract guarantees

- money in a pot can only ever go to two places: **the organiser**, once the goal is hit, or **back to
  the address that paid it in**
- refunds open when the deadline passes below the goal, or when a pot that hit its goal **still has
  not paid out 30 days after its deadline** (see "a frozen organiser" below)
- nobody can move money any other way. there is no owner, no admin, no pause, no upgrade and no fee.
  the deployer has no powers after deployment
- a signed chip-in cannot be redirected. the eip-3009 nonce commits to the pot id, the name and a salt,
  and the token signature commits to the payer, the contract and the amount. whoever submits it (our
  relayer or anyone else) can only do exactly what the payer signed
- a refund that fails for one person (for example a blocklisted address) does not block the others.
  that person keeps a claimable balance
- a transfer that does not happen is never counted: if the token refuses or reports failure, the whole
  chip-in, payout or claim reverts and nothing is recorded

## how it was checked

| check | result |
| --- | --- |
| unit and fuzz tests (`forge test`) | 34 tests pass, including a 1,000-run fuzz of money conservation, signature binding across pots, names, amounts and currencies, a hostile token that tries to re-enter, and a token that returns `false` instead of reverting |
| invariant testing | 256 runs of random sequences (create, chip in, time passes, pay out, refund all, claim) across four people and both currencies, 15,360 calls. after every step: the contract holds **exactly** what it still owes in each currency, and every unpaid pot's total equals the sum of its contributors |
| coverage (`forge coverage`) | **100%** of lines, statements, branches and functions in `Pottle.sol` |
| static analysis (slither 0.11.4) | 7 findings, none exploitable. see below |
| end to end on arc testnet | 15 checks with real usdc through the running app (`web/scripts/e2e-testnet.mjs`) |

### slither findings

| finding | verdict |
| --- | --- |
| reentrancy in `refundAll`: state written after the token transfer | not exploitable. it is the deliberate "put the balance back if this refund transfer fails" path; the tokens are circle's usdc and eurc, which cannot call back, and every state-changing function is behind a reentrancy lock (proven by the hostile-token test) |
| uninitialised local `ok` | made explicit |
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
  keeps failing. the mainnet contract lets everyone take their money back 30 days after the deadline,
  and pays the organiser instead if the freeze is lifted before anyone does. the thirty days are there
  so a freeze made by mistake and lifted after a review does not cost the organiser a pot they won.
  *the testnet contract `0x6eB9…5674` predates this and does not have it*
- **names are not verified.** the name next to a chip-in is whatever the payer typed
- **a pot can be filled with dust.** at most 100 contributors per pot, so someone could add 100
  separate $0.01 chip-ins from 100 wallets to lock others out. it costs them money and gains nothing
- **overpaying is allowed.** anything above the goal goes to the organiser with the rest
- **limits**: deadlines at most 90 days out, goals at most 10,000, names 24 bytes and titles 64 bytes
  (the app trims longer text so it never fails on chain)

## the app and its servers

- **the relayer** pays network fees so friends only sign. it holds a little usdc for gas and never
  holds pot money. it can only submit what people signed, or call `release` and `refundAll`, which
  anyone can call. every transaction is simulated first. it sponsors chip-ins of 1.00 or more, rate
  limits each visitor and wallet, keeps a $2 reserve so payouts and refunds always have gas, and retries
  once when two transactions collide on a nonce. if it declines, the app pays from the user's own
  wallet. a leaked relayer key could spend its gas money and nothing else
- **the settle job** (`/api/cron/settle`) is protected by a secret compared in constant time, only to
  stop strangers spending the relayer's gas; the functions it calls are permissionless anyway
- **the testnet drip** is switched off on mainnet, checks the user's dynamic session, records a payout
  before sending it so two simultaneous requests cannot both be paid, and is rate limited
- **the onramp** only creates a circle session for the signed-in user's own wallet, and only while the
  add money button is on screen
- **headers**: pottle cannot be embedded in another site (stops clickjacking the pay button), with
  nosniff and a strict referrer policy
- rate limits are kept per server instance, so they slow a spammer rather than stop a determined one;
  the hard limits are the $1 sponsor minimum and the reserve

## dependencies

`npm audit` for the shipped app reports 8 high findings, all one chain: `bigint-buffer`, which has no
fixed version, inside the solana connector of dynamic's sdk. pottle never uses solana. the other 24
findings (axios, uuid, stream-json, sharp, all under dynamic) are fixed by version overrides in
`web/package.json`. we are on dynamic's latest release; npm's suggested fix, downgrading dynamic to
1.x, would be worse.
