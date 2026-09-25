# what pottle does not protect against

pottle has **not had an outside security audit**. this file is our own honest read of the contract
and the app: what they guarantee, what they trust, and what can still go wrong. if you find
something that is not here, see [`SECURITY.md`](SECURITY.md).

## what the contract guarantees

- money in a pot can only ever go to two places: **the organiser**, once the goal is hit, or **back
  to the address that paid it in**, once the deadline passes below the goal
- nobody can move money any other way. there is no owner, no admin, no pause, no upgrade and no
  fee. the deployer has no special powers after deployment
- a signed chip-in cannot be redirected. the eip-3009 nonce commits to the pot id, the name and a
  salt, and the token signature commits to the payer, the contract and the amount. whoever submits
  it (our relayer or anyone else) can only do exactly what the payer signed
- a refund that fails for one person (for example a usdc-blocklisted address) does not block the
  others. that person keeps a claimable balance

## what it trusts

- **circle, as issuer of usdc and eurc.** circle can freeze or blocklist addresses. see the known
  issue below
- **the chain.** arc is run by a permissioned set of validators
- **dynamic**, for email sign-in. embedded wallets are dynamic's; pottle never sees a private key
- **the website.** a compromised frontend could ask you to sign a payment for a different pot or
  amount. your wallet shows the amount and the contract; the pot id is inside the signed nonce, so
  check the amount before you sign

## known issues and limits

- **a blocklisted organiser can strand a finished pot.** if circle blocklists the organiser's address
  after the goal is hit, `release` reverts every time, and because the goal was hit, refunds are not
  allowed either. the money stays in the contract. this needs a sanctions or theft blocklisting at
  exactly the wrong moment, but it is real. a fix (letting contributors refund a pot that still has
  not paid out 30 days after its deadline) is planned for the mainnet contract
- **names are not verified.** the name next to a chip-in is whatever the payer typed. anyone can chip
  in as "sarah"
- **a pot can be filled with dust.** a pot takes at most 100 contributors. someone could add 100
  separate $0.01 chip-ins from 100 wallets to lock others out. it costs them a little and gains
  them nothing, but it is possible
- **overpaying is allowed.** anything above the goal goes to the organiser with the rest
- **deadlines are set by the organiser**, at most 90 days out. goals are capped at 10,000 of the pot's
  currency

## the relayer

the relayer is a hot wallet that pays network fees so friends only sign. it holds a little usdc for
gas and **never holds anyone's pot money**.

- it can only submit what people signed, or call `release` and `refundAll`, which anyone can call
- every transaction is simulated first, so it only pays for transactions that succeed
- it sponsors chip-ins of 1.00 or more, rate limits each visitor and wallet, and keeps a reserve it
  never spends on chip-ins, so payouts and refunds always have gas
- if it refuses or is offline, the app sends the payment from the user's own wallet instead
- if its key leaked, an attacker could spend its gas money. they could not touch any pot

## the scheduled job

`/api/cron/settle` pays out and refunds due pots. it is protected by a secret only to stop strangers
from spending the relayer's gas; the functions it calls are permissionless on the contract anyway.

## testnet only

`/api/drip` sends $10 (and €10 when it has some) of test money to a new signed-in wallet. it is
switched off on mainnet by the network setting and checks the user's dynamic session token.
