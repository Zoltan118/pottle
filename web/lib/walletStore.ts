"use client";

import { useSyncExternalStore } from "react";
import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { WALLETS_ON } from "./config";

export type WalletApi = {
  on: boolean; // false when sign-in is not configured
  ready: boolean; // the sign-in sdk has loaded in the browser
  address?: Address;
  userId?: string; // dynamic user id, the `sub` on their token
  signIn: () => void;
  signOut: () => void;
  client: () => Promise<WalletClient<Transport, Chain, Account>>;
  authHeader: () => string; // proves who the user is to our own api: "Bearer <dynamic jwt>" or "Circle <userToken>"
};

// the dynamic sdk only runs in the browser. it publishes into this store, the app reads from it,
// so every page can still render on the server
const initial: WalletApi = {
  on: WALLETS_ON,
  ready: !WALLETS_ON,
  signIn: () => console.warn("[pottle] sign-in not ready" + (WALLETS_ON ? "" : ", no wallet provider configured")),
  signOut: () => {},
  client: async () => { throw new Error("sign-in is not ready"); },
  authHeader: () => "",
};

let current = initial;
const listeners = new Set<() => void>();

export const walletStore = {
  set(next: WalletApi) { current = next; listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useWallet = () => useSyncExternalStore(walletStore.subscribe, () => current, () => initial);

// development only: lets a local test load a wallet into the store without a real sign-in
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __pottleWallet: typeof walletStore }).__pottleWallet = walletStore;
}
