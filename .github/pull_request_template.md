## what this changes

## how it was checked

- [ ] `forge test` passes (if the contract changed)
- [ ] `npm run lint` and `npx tsc --noEmit` pass in `web/`
- [ ] tried on a phone-width screen, light and dark

the deployed contract is immutable: a change to `Pottle.sol` only reaches users through a new
deployment, so say whether this needs one.
