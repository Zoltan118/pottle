import "server-only";
import { initiateUserControlledWalletsClient, type Blockchain } from "@circle-fin/user-controlled-wallets";
import { NETWORK } from "./config";

// circle user-controlled wallets, server side. the api key never leaves the server; the browser only
// ever holds the user's own short-lived userToken. every action that moves money or signs is approved
// by the user in circle's own screen, so this server cannot act for a user on its own.
export const CIRCLE_CHAIN = (NETWORK === "mainnet" ? "ARC" : "ARC-TESTNET") as Blockchain;

let cached: ReturnType<typeof initiateUserControlledWalletsClient> | null = null;
export function circle() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) return null;
  cached ??= initiateUserControlledWalletsClient({ apiKey });
  return cached;
}

/** the app id is public by design; read it from any of the names it may have been saved under */
export const circleAppId = () =>
  process.env.CIRCLE_APP_ID || process.env.NEXT_CIRCLE_APP_ID || process.env.NEXT_PUBLIC_CIRCLE_APP_ID || undefined;

/** the user's pottle wallet on arc, or null */
export async function circleWallet(userToken: string) {
  const c = circle();
  if (!c) return null;
  const r = await c.listWallets({ userToken, blockchain: CIRCLE_CHAIN });
  const w = r.data?.wallets?.find((x) => x.blockchain === CIRCLE_CHAIN);
  return w ? { walletId: w.id, address: w.address, userId: w.userId ?? "" } : null;
}

/** circle's error code, e.g. 155106 (user already set up) or 155104 (token expired) */
export function circleCode(e: unknown): number | undefined {
  const x = e as { code?: number; response?: { data?: { code?: number } } };
  return x?.response?.data?.code ?? x?.code;
}
