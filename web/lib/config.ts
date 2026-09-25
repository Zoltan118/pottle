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

/** names of required env vars that are not set, so the ui can say what is off instead of failing quietly */
export const missingEnv = [
  !POTTLE && "NEXT_PUBLIC_POTTLE_ADDRESS",
  !DYNAMIC_ENV && "NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID",
].filter(Boolean) as string[];

if (missingEnv.length) console.warn(`[pottle] missing env: ${missingEnv.join(", ")}`);

export const explorerTx = (hash: string) => `${chain.blockExplorers?.default.url}/tx/${hash}`;
