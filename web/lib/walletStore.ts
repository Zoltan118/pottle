"use client";

import { useSyncExternalStore } from "react";
import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { WALLETS_ON } from "./config";
import * as dyn from "./dynamicClient";

export type WalletApi = {
  on: boolean; // false when sign-in is not configured
  ready: boolean; // we know whether this device is signed in
  address?: Address;
  userId?: string; // dynamic user id, the `sub` on their token
  /** asks the person to sign in. resolves with the address once signed in, or null if they close it.
   * inline: the page draws the sign-in itself (the chip-in sheet does), instead of the sign-in sheet */
  signIn: (opts?: { inline?: boolean }) => Promise<Address | null>;
  waiting: boolean; // a sign-in was asked for and has not finished yet
  prompt: null | { inline: boolean }; // where the sign-in fields should show right now
  wasSignedIn: boolean; // this device was signed in last time, so before we know, show a placeholder, not "sign in"
  signOut: () => Promise<void>; // resolves once dynamic has logged out too, so a sign-in right after starts clean
  client: () => Promise<WalletClient<Transport, Chain, Account>>;
  authHeader: () => string; // "Bearer <dynamic session token>", proves who the user is to our own api
};

// sign-in lives in pottle's own ui (components/SignIn.tsx) on top of dynamic's headless sdk. this store is
// the one place the app reads it from, so every page can still render on the server
let waiters: ((a: Address | null) => void)[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const HINT = "pottle:signed-in";
const readHint = () => { try { return localStorage.getItem(HINT) === "1"; } catch { return false; } };
const writeHint = (on: boolean) => { try { if (on) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT); } catch {} };

function requestSignIn(opts?: { inline?: boolean }): Promise<Address | null> {
  if (!WALLETS_ON) { console.warn("[pottle] sign-in off, set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID"); return Promise.resolve(null); }
  if (current.address) return Promise.resolve(current.address);
  const done = new Promise<Address | null>((r) => waiters.push(r));
  current = { ...current, waiting: true, prompt: { inline: !!opts?.inline } };
  emit();
  void dyn.loadDynamic().catch(() => {}); // start fetching the sdk while they type their email
  return done;
}

function signOut() {
  const out = dyn.signOut().catch(() => {});
  writeHint(false);
  try { sessionStorage.removeItem("pottle:signin-pending"); } catch {}
  void import("./wallet").then((m) => m.forgetSignatures());
  const w = waiters;
  waiters = [];
  w.forEach((r) => r(null));
  current = { ...current, address: undefined, userId: undefined, wasSignedIn: false, waiting: false, prompt: null };
  emit();
  return out;
}

const initial: WalletApi = {
  on: WALLETS_ON,
  ready: !WALLETS_ON,
  waiting: false,
  prompt: null,
  wasSignedIn: false,
  signIn: requestSignIn,
  signOut,
  client: dyn.walletClient,
  authHeader: dyn.authHeader,
};

// the server always renders the signed-out state; the browser starts from what it remembers
let current: WalletApi = typeof window === "undefined" ? initial : { ...initial, wasSignedIn: readHint() };

const PENDING = "pottle:signin-pending"; // the sign-in fields keep their half-done step here (components/SignIn.tsx)

export const walletStore = {
  /** signed in (from the sign-in fields, or a session picked back up): tell everyone, finish what was asked */
  signedIn(s: { address: Address; userId?: string }) {
    writeHint(true);
    const w = waiters;
    waiters = [];
    current = { ...current, ready: true, address: s.address, userId: s.userId, waiting: false, prompt: null, wasSignedIn: true };
    emit();
    w.forEach((r) => r(s.address));
  },
  /** the person closed the sign-in without finishing */
  cancel() {
    // a sign-in someone closed is not brought back on the next page load
    try { sessionStorage.removeItem(PENDING); } catch {}
    const w = waiters;
    waiters = [];
    current = { ...current, waiting: false, prompt: null };
    emit();
    w.forEach((r) => r(null));
  },
  /** we now know this device is signed out */
  signedOut() {
    writeHint(false);
    current = { ...current, ready: true, address: undefined, userId: undefined, wasSignedIn: false };
    emit();
  },
  /** reopen the sign-in fields (after a reload in the middle of signing in) */
  reopen() {
    if (current.address) return;
    current = { ...current, prompt: current.prompt ?? { inline: false } };
    emit();
  },
  /** the latest state, for code that runs after an await and must not use a stale render's copy */
  get: () => current,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useWallet = () => useSyncExternalStore(walletStore.subscribe, () => current, () => initial);

// dynamic ended the session by itself (token expiry): show the person as signed out, so the next
// payment asks them to sign in instead of failing with "sign in first"
dyn.onSessionEnd(() => { if (current.address) walletStore.signedOut(); });

// development only: lets a local test load a wallet into the store without a real sign-in
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __pottleWallet: typeof walletStore }).__pottleWallet = walletStore;
}
