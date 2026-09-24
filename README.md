# pottle

a pot for the group chat. everyone's in, or everyone's refunded. usdc on arc.

- set a goal and a deadline, share one link
- friends sign in with email (dynamic) and chip in with one signature
- goal hit: the pot goes to the organiser. deadline missed: everyone gets their exact money back
- nobody can take a pot early, not the organiser and not us. no owner, no fee

## layout

- `contracts/` foundry project. `src/Pottle.sol` holds every pot
- `web/` next.js app: landing at `/`, make a pot at `/new`, the pot at `/p/[id]`

## run it

```bash
cd contracts && forge test
```

```bash
cd web && cp .env.example .env.local && npm install && npm run dev
```

## deploy the contract (testnet)

1. get testnet usdc for the deployer address at https://faucet.circle.com (arc testnet)
2. `cd contracts && cp .env.example .env`, fill `DEPLOYER_PRIVATE_KEY`
3. `set -a && . ./.env && set +a && forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --broadcast`
4. put the printed address in `web/.env.local` as `NEXT_PUBLIC_POTTLE_ADDRESS`

## notes

- arc's usdc is circle's fiattoken (name `USDC`, version `2`, 6 decimals) and supports eip-3009, which is how one signature is enough
- arc moves usdc through a native precompile, so a local fork cannot run real usdc transfers. the test suite uses a mock with the same eip-3009 rules; real-token checks happen on testnet
- `RELAYER_PRIVATE_KEY` is optional. with it, the app pays network fees so friends only sign. without it, each person pays their own fee (about a tenth of a cent)
