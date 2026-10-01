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
let ended: (() => void) | null = null;
/** called when dynamic ends the session by itself (the token expired, or it logged out), so the app stops
 * showing someone as signed in who can no longer sign */
export const onSessionEnd = (cb: () => void) => { ended = cb; };

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
    c.onEvent({ event: "logout", listener: () => ended?.() });
    c.onEvent({ event: "userChanged", listener: ({ user }: { user: unknown }) => { if (!user) ended?.(); } });
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
  // allowNewMFALinking: someone with no passkey yet gets ten minutes in which adding one needs no
  // second email code, only face id
  await c.verifyOTP({ otpVerification: verification, verificationToken: code.trim(), allowNewMFALinking: true });
  return withWallet();
}

async function withWallet() {
  const w = await import("@dynamic-labs-sdk/client/waas");
  const missing = w.getChainsMissingWaasWalletAccounts();
  if (missing.length) await w.createWaasWalletAccounts({ chains: missing });
  return session();
}

/*
 * sign in with face id: the passkey someone added as their lock also signs them in, once dynamic has
 * passkey sign-in switched on. email stays for a new phone or a lost passkey
 */
const HAS_PASSKEY = "pottle:passkey"; // this device has made or used a pottle passkey: offer face id first
export const passkeyOnDevice = () => { try { return localStorage.getItem(HAS_PASSKEY) === "1"; } catch { return false; } };
const markPasskeyDevice = (on: boolean) => { try { if (on) localStorage.setItem(HAS_PASSKEY, "1"); else localStorage.removeItem(HAS_PASSKEY); } catch {} };

/** passkey sign-in is on in dynamic, as a way to sign in and not only as the lock, and this browser can do it */
export async function passkeyLoginOffered() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  const c = await loadDynamic();
  const s = c.getDefaultClient().projectSettings as unknown as { providers?: { provider?: string; enabledAt?: unknown }[] } | null;
  return !!s?.providers?.some((p) => /passkey/i.test(p.provider ?? "") && !!p.enabledAt);
}

/** call from a tap: opens face id, signs in, and makes sure the wallet is there */
export async function signInPasskey() {
  const c = await loadDynamic();
  await c.signInWithPasskey();
  markPasskeyDevice(true);
  return withWallet();
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
  const wc = (await createWalletClientForWalletAccount({ walletAccount: account })) as unknown as WalletClient<Transport, Chain, Account>;
  if (wc.chain?.id !== chain.id) throw new Error(`the wallet is on chain ${wc.chain?.id}, not ${chain.name}`);
  return wc;
}

/*
 * passkeys, optional: face id sign-in. a passkey signs the person in instead of an email code, and
 * dynamic asks for it (step-up) before a key is added to or removed from the account. payments don't
 * ask for it: dynamic can't protect signing only for people who have a passkey (with enrollment "not
 * required" it falls back to an email code for everyone else), and a face id check only in pottle's
 * pages could be skipped, so pottle doesn't pretend. dashboard: enrollment "not required",
 * session-based mfa off, the passkey method on with backup codes, passkey as a login method
 */

/** dynamic is set up for optional passkeys (see above). false hides the feature */
export async function passkeysOffered() {
  const c = await loadDynamic();
  const mfa = c.getDefaultClient().projectSettings?.security?.mfa;
  // not mfa.enabled: in dynamic's dashboard that flag is "session-based mfa" (a second factor at every
  // login), which pottle keeps off. face id sign-in only needs the passkey method on
  return !!mfa?.methods?.some((m) => m.type === "passkey" && m.enabled);
}

export type Passkey = { id: string; createdAt: Date; device?: string; storage?: string };
export async function passkeys(): Promise<Passkey[]> {
  const c = await loadDynamic();
  return (await c.getPasskeys()).map((p) => ({ id: p.id, createdAt: p.createdAt, device: p.alias || p.userAgent }));
}

/**
 * adding a passkey links a new way into the account, so dynamic first wants fresh proof it is really
 * them: a code sent to their email. returns the pending check, or null when dynamic doesn't need one
 */
export async function confirmForPasskey(): Promise<Verification | null> {
  const c = await loadDynamic();
  if (!(await c.checkStepUpAuth({ scope: c.TokenScope.Credentiallink })).isRequired) return null;
  const email = (c.getDefaultClient().user as { email?: string } | null)?.email;
  if (!email) throw new Error("this account has no email to confirm with.");
  return c.sendEmailOTP({ email });
}
/** the emailed code checks out: dynamic hands back a short-lived permission to add the passkey */
export async function confirmCode(v: Verification, code: string) {
  const c = await loadDynamic();
  await c.verifyOTP({ otpVerification: v, verificationToken: code.trim(), requestedScopes: [c.TokenScope.Credentiallink] });
  // the code was right but dynamic gave no permission to add a passkey: say so now, not one tap later
  if (!c.getElevatedAccessToken({ scope: c.TokenScope.Credentiallink, consume: false })) {
    throw new Error("the code worked, but sign-in didn't allow adding a passkey (no credential:link permission).");
  }
}

/** adds a passkey (call from a tap: it opens face id). returns recovery codes to show once */
export async function addPasskey(): Promise<string[]> {
  const c = await loadDynamic();
  const permitted = !!c.getElevatedAccessToken({ scope: c.TokenScope.Credentiallink, consume: false });
  // which site the passkey is being made for, read off the browser call, for when dynamic refuses it
  let rp = "?";
  const create = navigator.credentials.create.bind(navigator.credentials);
  navigator.credentials.create = (o?: CredentialCreationOptions) => { rp = o?.publicKey?.rp?.id ?? "(none)"; return create(o); };
  try {
    await c.registerPasskey();
    markPasskeyDevice(true);
  } catch (e) {
    const x = e as { name?: string; message?: string; status?: number; code?: string };
    if (x.name === "NotAllowedError" || x.name === "AbortError" || x.name === "InvalidStateError") throw e;
    console.warn("[pottle] adding a passkey failed", { rp, host: location.hostname, permitted, status: x.status, code: x.code, message: x.message });
    throw new Error("couldn't add the passkey. try again, or sign out and back in first.");
  } finally {
    navigator.credentials.create = create;
  }
  if (!c.isPendingRecoveryCodesAcknowledgment()) return [];
  const { recoveryCodes } = await c.getMfaRecoveryCodes();
  // marked as seen at once, not when the person taps "saved": codes left pending can be fetched again
  // by any signed-in session, and one of them stands in for face id. they live on screen only, until dismissed
  await c.acknowledgeRecoveryCodes().catch((e) => console.warn("[pottle] couldn't mark recovery codes as seen:", e));
  return recoveryCodes ?? [];
}
// no way to make new recovery codes: a fresh set could stand in for face id, so codes come once, when
// the passkey is added. lost them and the phone? remove the passkey from a signed-in device and add a new one

export async function removePasskey(id: string) {
  const c = await loadDynamic();
  // removing the lock takes the lock itself
  if ((await c.checkStepUpAuth({ scope: c.TokenScope.Credentialunlink })).isRequired) {
    await passkeyProof(c.TokenScope.Credentialunlink);
  }
  await c.deletePasskey({ passkeyId: id });
  markPasskeyDevice(false);
}

/** a lost passkey: one recovery code stands in for it, once, so the lost passkey can be removed */
export async function redeemRecoveryCode(code: string) {
  const c = await loadDynamic();
  await c.authenticateMfaRecoveryCode({ code: code.trim(), requestedScopes: [c.TokenScope.Credentialunlink] });
}

/** face id, for one kind of permission */
async function passkeyProof(scope: Awaited<ReturnType<typeof loadDynamic>>["TokenScope"][keyof Awaited<ReturnType<typeof loadDynamic>>["TokenScope"]]) {
  const c = await loadDynamic();
  try {
    await c.authenticatePasskeyMFA({ requestedScopes: [scope] });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "NotAllowedError" || name === "AbortError") throw new Error("face id was cancelled, so nothing was signed.");
    if (name === "NoPasskeyCredentialsFoundError") throw new Error("this phone doesn't have your passkey. use a recovery code in your account.");
    throw e;
  }
}

/**
 * "Bearer <dynamic session token>", which proves who the user is to pottle's own api. the sdk keeps two
 * tokens: `token` is a minified jwt without the wallet list, the full one (`legacyToken`) carries
 * verified_credentials, which the drip and onramp check to know the wallet is the user's. the full one
 * is only on the sdk's internal state; that is stable because the sdk is pinned to an exact version
 * (package.json), and it falls back to the minified one. empty until the sdk has loaded
 */
export function authHeader() {
  if (!loaded) return "";
  const client = loaded.getDefaultClient() as unknown as { token: string | null; __core?: { state: { get(): { legacyToken?: string | null } } } };
  const token = client.__core?.state.get().legacyToken ?? client.token;
  return token ? `Bearer ${token}` : "";
}

export async function signOut() {
  const c = await loadDynamic();
  await c.logout();
}
