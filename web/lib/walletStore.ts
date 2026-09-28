"use client";

import { useSyncExternalStore } from "react";
import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { WALLETS_ON } from "./config";

export type WalletApi = {
  on: boolean; // false when sign-in is not configured
  ready: boolean; // the sign-in sdk has loaded in the browser
  address?: Address;
  userId?: string; // dynamic user id, the `sub` on their token
  /** opens sign-in, or remembers the tap until the sdk has loaded. resolves with the address once
   * signed in, or null if the person closed sign-in without finishing */
  signIn: () => Promise<Address | null>;
  waiting: boolean; // a sign-in was asked for and has not finished yet
  wasSignedIn: boolean; // this device was signed in last time, so before the sdk loads show a placeholder, not "sign in"
  authOpen?: boolean; // dynamic's sign-in window is showing
  openAuth?: () => void; // shows dynamic's sign-in window, set once the sdk has loaded
  signOut: () => void;
  client: () => Promise<WalletClient<Transport, Chain, Account>>;
  authHeader: () => string; // "Bearer <dynamic session token>", proves who the user is to our own api
};

// the dynamic sdk only runs in the browser. it publishes into this store, the app reads from it,
// so every page can still render on the server
let waiters: ((a: Address | null) => void)[] = [];
const listeners = new Set<() => void>();

/** a tap on "sign in" is never lost: before the sdk has loaded it waits, and opens as soon as it can */
function requestSignIn(): Promise<Address | null> {
  if (!WALLETS_ON) { console.warn("[pottle] sign-in off, set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID"); return Promise.resolve(null); }
  if (current.address) return Promise.resolve(current.address);
  const done = new Promise<Address | null>((r) => waiters.push(r));
  if (!current.waiting) { current = { ...current, waiting: true }; listeners.forEach((l) => l()); }
  if (current.ready) current.openAuth?.();
  return done;
}

function settle(a: Address | null) {
  const w = waiters;
  waiters = [];
  w.forEach((r) => r(a));
}

const HINT = "pottle:signed-in";
const readHint = () => { try { return localStorage.getItem(HINT) === "1"; } catch { return false; } };
const writeHint = (on: boolean) => { try { if (on) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT); } catch {} };

const initial: WalletApi = {
  on: WALLETS_ON,
  ready: !WALLETS_ON,
  waiting: false,
  wasSignedIn: false,
  signIn: requestSignIn,
  signOut: () => {},
  client: async () => { throw new Error("sign-in is not ready"); },
  authHeader: () => "",
};

// the server always renders the signed-out state; the browser starts from what it remembers
let current: WalletApi = typeof window === "undefined" ? initial : { ...initial, wasSignedIn: readHint() };

export const walletStore = {
  set(next: Omit<WalletApi, "signIn" | "waiting" | "wasSignedIn">) {
    const prev = current;
    let waiting = prev.waiting;
    if (next.address && waiting) { waiting = false; settle(next.address); } // signed in: carry on with what was asked
    else if (waiting && prev.authOpen && !next.authOpen && !next.address) { waiting = false; settle(null); } // closed without signing in
    // remember for next time, but only once the sdk has settled, so a load in progress never clears it
    if (next.ready) writeHint(!!next.address);
    current = { ...next, signIn: requestSignIn, waiting, wasSignedIn: next.ready ? !!next.address : prev.wasSignedIn };
    if (waiting && next.ready && !prev.ready && !next.address) next.openAuth?.(); // the sdk just finished loading
    listeners.forEach((l) => l());
  },
  /** the latest state, for code that runs after an await and must not use a stale render's copy */
  get: () => current,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useWallet = () => useSyncExternalStore(walletStore.subscribe, () => current, () => initial);

// development only: lets a local test load a wallet into the store without a real sign-in
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __pottleWallet: typeof walletStore }).__pottleWallet = walletStore;
}
