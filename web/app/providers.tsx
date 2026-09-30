"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WALLETS_ON } from "@/lib/config";
import { UpdateCheck } from "@/components/UpdateCheck";

export { useWallet, type WalletApi } from "@/lib/walletStore";

// dynamic reads window when it loads, so it only ever loads in the browser
const DynamicHost = dynamic(() => import("@/components/DynamicHost"), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  // the sign-in lab runs dynamic's headless sdk on its own; the popup sdk stays off there so the two never share a session
  const lab = usePathname()?.startsWith("/lab");
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <UpdateCheck />
      {WALLETS_ON && !lab && <DynamicHost />}
    </QueryClientProvider>
  );
}
