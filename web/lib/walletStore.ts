"use client";

import { useSyncExternalStore } from "react";
import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { DYNAMIC_ENV } from "./config";

export type WalletApi = {
  on: boolean; // false when sign-in is not configured
  ready: boolean; // the sign-in sdk has loaded in the browser
  address?: Address;
  signIn: () => void;
  signOut: () => void;
  client: () => Promise<WalletClient<Transport, Chain, Account>>;
};

// the dynamic sdk only runs in the browser. it publishes into this store, the app reads from it,
// so every page can still render on the server
const initial: WalletApi = {
  on: !!DYNAMIC_ENV,
  ready: !DYNAMIC_ENV,
  signIn: () => console.warn("[pottle] sign-in not ready" + (DYNAMIC_ENV ? "" : ", set NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID")),
  signOut: () => {},
  client: async () => { throw new Error("sign-in is not ready"); },
};

let current = initial;
const listeners = new Set<() => void>();

export const walletStore = {
  set(next: WalletApi) { current = next; listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useWallet = () => useSyncExternalStore(walletStore.subscribe, () => current, () => initial);
