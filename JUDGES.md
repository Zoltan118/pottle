# trying pottle as a reviewer

everything below runs on **arc testnet** with free test money, so nothing costs you anything.
about three minutes.

## 1. make a pot (one minute)

1. open **https://pottle-1.vercel.app** on your phone or laptop
2. tap **sign in** and use any email. dynamic sends a code and makes you a wallet
3. your balance pill shows **+$10…** and then **$10**. that is test usdc, sent to new wallets
   automatically so you never need a faucet
4. tap **make a pot**. five one-word questions: for? goal? until? wrap? you?
   (pick **$** or **€** on the goal step. euro pots need test eurc, see the note at the end)
5. **create pot**. you get a link

## 2. chip in from a second person (one minute)

1. open the link in a **private window** (or send it to your phone) and sign in with a **different
   email**. it gets its own $10
2. tap **i'm in**, pick **$5**, tap **pay $5**. you sign once. pottle pays the network fee
3. back in the first window, within a few seconds, a coin with that name drops into the pot and
   their face appears. the page reads the chain every five seconds

## 3. what to look at (one minute)

- **safe?** on the pot page: nobody can take the money early. the contract has no owner
- **nudge** opens your share sheet with a reminder already written. **qr** shows a code to scan
- your **balance pill** lists every pot you made or joined, each with a share button
- share the pot link in any chat: the preview shows the live total
- **hit the goal** and the pot pays itself out: it settles when anyone opens it, or within ten
  minutes from the scheduled job. its preview turns into a thank-you card with everyone's names
- a pot that **misses its deadline** refunds everyone the same way. deadlines are at least an hour
  away, so the fastest way to see a refund is the end-to-end run below

## the end-to-end run

`web/scripts/e2e-testnet.mjs` drives the whole flow against the running app with real test usdc:
signature chip-in with a sponsored fee, a classic chip-in, payout, a refund after a 40 second
deadline, the pot lists, the scheduled job paying out a pot nobody touched, and a pot paying
itself out when its page is opened. 15 checks. it needs a funded testnet key in `contracts/.env`.

## the code worth reading

- [`contracts/src/Pottle.sol`](contracts/src/Pottle.sol): the whole contract, about 300 lines
- [`contracts/test/Pottle.t.sol`](contracts/test/Pottle.t.sol): 34 tests, including fuzzing and
  signature binding, and [`PottleInvariant.t.sol`](contracts/test/PottleInvariant.t.sol) for random
  sequences
- [`AUDIT.md`](AUDIT.md): our own security review
- [`web/lib/wallet.ts`](web/lib/wallet.ts): signing a chip-in for the pot's own token
- [`web/app/api/relay/route.ts`](web/app/api/relay/route.ts): the sponsor, and how it refuses to be
  drained
- [`web/lib/settle.ts`](web/lib/settle.ts): automatic payout and refund

## euro pots

a euro pot is paid in eurc. new wallets get €10 of test eurc alongside the $10 whenever the
relayer holds some. if it has run out, test eurc is free at https://faucet.circle.com (pick arc
testnet and eurc).
