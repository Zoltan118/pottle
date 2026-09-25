"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WALLET_PROVIDER, WALLETS_ON } from "@/lib/config";

export { useWallet, type WalletApi } from "@/lib/walletStore";

// both wallet sdks need the browser, so they only ever load there.
// NEXT_PUBLIC_WALLET_PROVIDER picks one: circle (email wallets) or dynamic.
const DynamicHost = dynamic(() => import("@/components/DynamicHost"), { ssr: false });
const CircleHost = dynamic(() => import("@/components/CircleHost"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {WALLETS_ON && (WALLET_PROVIDER === "circle" ? <CircleHost /> : <DynamicHost />)}
    </QueryClientProvider>
  );
}
