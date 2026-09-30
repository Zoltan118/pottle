"use client";

import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { chain, DYNAMIC_ENV, NETWORK } from "./config";

/*
 * signing in with an email, through dynamic's headless sdk. no popup: pottle draws the email and code
 * fields itself (components/SignIn.tsx) and this file does the work behind them. adapted from trustset.
 *
 * nothing here loads until it is needed: the sdk is imported the first time someone starts signing in,
 * or when a device that was signed in before comes back and its session is picked up again. a page
 * that only shows a pot never downloads it.
 */

type Client = typeof import("@dynamic-labs-sdk/client");
export type Verification = Awaited<ReturnType<Client["sendEmailOTP"]>>;

let ready: Promise<Client> | null = null;
let loaded: Client | null = null; // set once the sdk has initialised, for the one caller that must answer synchronously

export function loadDynamic(): Promise<Client> {
  if (!DYNAMIC_ENV) return Promise.reject(new Error("sign-in is not configured"));
  if (!ready) ready = (async () => {
    const c = await import("@dynamic-labs-sdk/client");
    const { addWaasEvmExtension } = await import("@dynamic-labs-sdk/evm/waas");
    const arc = {
      networkId: String(chain.id), chain: "EVM", name: chain.name, displayName: chain.name, testnet: NETWORK !== "mainnet",
      rpcUrls: { http: [...chain.rpcUrls.default.http] }, blockExplorerUrls: [chain.blockExplorers?.default.url ?? ""],
      iconUrl: "", nativeCurrency: { decimals: chain.nativeCurrency.decimals, name: chain.nativeCurrency.name, symbol: chain.nativeCurrency.symbol },
    };
    c.createDynamicClient({
      environmentId: DYNAMIC_ENV, autoInitialize: false,
      metadata: { name: "pottle", universalLink: location.origin },
      // arc first, so a fresh embedded wallet starts on it, and added even if the dashboard does not
      // list it, rather than trusting a setting nobody can see from the code
      transformers: {
        networksData: (nets) => {
          const evm = nets.find((n) => n.networkId === arc.networkId) ?? (arc as unknown as (typeof nets)[number]);
          return [evm, ...nets.filter((n) => n.networkId !== arc.networkId)];
        },
      },
    });
    addWaasEvmExtension();
    await c.initializeClient();
    loaded = c;
    return c;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export async function sendCode(email: string): Promise<Verification> {
  const c = await loadDynamic();
  return c.sendEmailOTP({ email });
}

/** checks the code, then makes sure the embedded wallet exists. dynamic's own guide: signing in does not
 * create the wallet, and the account list can read non-empty right after sign-in, so the missing chains
 * are asked for rather than inferred from the list */
export async function verifyCode(verification: Verification, code: string) {
  const c = await loadDynamic();
  await c.verifyOTP({ otpVerification: verification, verificationToken: code.trim() });
  const w = await import("@dynamic-labs-sdk/client/waas");
  const missing = w.getChainsMissingWaasWalletAccounts();
  if (missing.length) await w.createWaasWalletAccounts({ chains: missing });
  return session();
}

/** who is signed in on this device right now, or null */
export async function session(): Promise<{ address: Address; userId?: string } | null> {
  const c = await loadDynamic();
  const { isEvmWalletAccount } = await import("@dynamic-labs-sdk/evm");
  const account = c.getWalletAccounts().find(isEvmWalletAccount);
  if (!account) return null;
  const user = c.getDefaultClient().user as { id?: string } | null;
  return { address: account.address as Address, userId: user?.id };
}

/** a viem wallet client for the signed-in embedded wallet. refuses any chain but pottle's: a signature
 * made for the wrong chain is a payment that lands somewhere else */
export async function walletClient(): Promise<WalletClient<Transport, Chain, Account>> {
  const c = await loadDynamic();
  const { isEvmWalletAccount } = await import("@dynamic-labs-sdk/evm");
  const { createWalletClientForWalletAccount } = await import("@dynamic-labs-sdk/evm/viem");
  const account = c.getWalletAccounts().find(isEvmWalletAccount);
  if (!account) throw new Error("sign in first");
  const wc = await createWalletClientForWalletAccount({ walletAccount: account });
  if (wc.chain?.id !== chain.id) throw new Error(`the wallet is on chain ${wc.chain?.id}, not ${chain.name}`);
  return wc as unknown as WalletClient<Transport, Chain, Account>;
}

/** "Bearer <dynamic session token>", which proves who the user is to pottle's own api. empty until the
 * sdk has loaded (nobody can be signed in before that) */
export function authHeader() {
  const token = loaded?.getDefaultClient().token;
  return token ? `Bearer ${token}` : "";
}

export async function signOut() {
  const c = await loadDynamic();
  await c.logout();
}
