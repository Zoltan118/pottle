import { arc, arcTestnet } from "viem/chains";
import type { Address } from "viem";

export const NETWORK = process.env.NEXT_PUBLIC_ARC_NETWORK === "mainnet" ? "mainnet" : "testnet";
export const chain = NETWORK === "mainnet" ? arc : arcTestnet;

// circle's usdc on arc, same address on mainnet and testnet. 6 decimals through this interface.
export const USDC: Address = "0x3600000000000000000000000000000000000000";
// circle's eurc on arc, 6 decimals, a different address per network
export const EURC: Address = NETWORK === "mainnet" ? "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1" : "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

export type Currency = "usd" | "eur";
export const CURRENCIES: Currency[] = ["usd", "eur"]; // index matches the contract's currency field
/** the token a currency is paid in, and the name it signs with (eip-712 domain name) */
export const TOKEN: Record<Currency, { address: Address; name: "USDC" | "EURC"; symbol: string }> = {
  usd: { address: USDC, name: "USDC", symbol: "$" },
  eur: { address: EURC, name: "EURC", symbol: "€" },
};

export const POTTLE = (process.env.NEXT_PUBLIC_POTTLE_ADDRESS || undefined) as Address | undefined;
export const DYNAMIC_ENV = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || undefined;
/** email sign-in (dynamic embedded wallets) is on when its environment id is set */
export const WALLETS_ON = !!DYNAMIC_ENV;

/** names of required env vars that are not set, so the ui can say what is off instead of failing quietly */
// anything but exactly "mainnet" or "testnet" (or unset) is a typo that would quietly mean testnet
const NETWORK_RAW = process.env.NEXT_PUBLIC_ARC_NETWORK;
export const missingEnv = [
  NETWORK_RAW && NETWORK_RAW !== "mainnet" && NETWORK_RAW !== "testnet" && `NEXT_PUBLIC_ARC_NETWORK (is "${NETWORK_RAW}", must be mainnet or testnet)`,
  !POTTLE && "NEXT_PUBLIC_POTTLE_ADDRESS",
  !DYNAMIC_ENV && "NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID",
].filter(Boolean) as string[];

if (missingEnv.length) console.warn(`[pottle] missing env: ${missingEnv.join(", ")}`);

// arc's own explorers, the ones its docs link to
const EXPLORER = NETWORK === "mainnet" ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io";
export const explorerAddress = (a: string) => `${EXPLORER}/address/${a}`;
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}`;

// cash out through base: circle's cctp v2 burns usdc on arc and its forwarding service mints it on base,
// taking its fee from the usdc, so nobody needs eth on base. public circle contracts, the same address on
// every chain of a network. arc is cctp domain 26, base is 6
export const CCTP = {
  tokenMessenger: (NETWORK === "mainnet" ? "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" : "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA") as Address,
  iris: NETWORK === "mainnet" ? "https://iris-api.circle.com" : "https://iris-api-sandbox.circle.com",
  arc: 26,
  base: 6,
  // "cctp-forward", version 0, no extra data: asks circle to do the mint on base
  forwardHook: "0x636374702d666f72776172640000000000000000000000000000000000000000" as const,
};
export const BASE_NAME = NETWORK === "mainnet" ? "base" : "base sepolia";
export const baseExplorerTx = (h: string) => `${NETWORK === "mainnet" ? "https://basescan.org" : "https://sepolia.basescan.org"}/tx/${h}`;

export const REPO = "https://github.com/Zoltan118/pottle";
/** the public address of this site. vercel sets VERCEL_PROJECT_PRODUCTION_URL; NEXT_PUBLIC_SITE_URL overrides it (e.g. a custom domain) */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
/** the same app on the other network, e.g. the free testnet site linked from mainnet. optional */
export const OTHER_SITE = process.env.NEXT_PUBLIC_OTHER_SITE_URL || undefined;
