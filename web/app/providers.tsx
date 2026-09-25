"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WALLETS_ON } from "@/lib/config";

export { useWallet, type WalletApi } from "@/lib/walletStore";

// dynamic reads window when it loads, so it only ever loads in the browser
const DynamicHost = dynamic(() => import("@/components/DynamicHost"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {WALLETS_ON && <DynamicHost />}
    </QueryClientProvider>
  );
}
