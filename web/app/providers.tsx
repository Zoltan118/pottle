"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WALLETS_ON } from "@/lib/config";
import { UpdateCheck } from "@/components/UpdateCheck";

export { useWallet, type WalletApi } from "@/lib/walletStore";

// sign-in only ever runs in the browser. the host is small; dynamic's sdk itself loads later, and only when needed
const WalletHost = dynamic(() => import("@/components/WalletHost"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <UpdateCheck />
      {WALLETS_ON && <WalletHost />}
    </QueryClientProvider>
  );
}
