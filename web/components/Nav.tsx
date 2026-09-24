"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { requestDrip, usdcBalance } from "@/lib/wallet";
import { NETWORK } from "@/lib/config";
import { usd } from "@/lib/pot";
import { Logo } from "./Mark";
import { Sheet } from "./Sheet";

/** logo left; right: the page's own action plus sign in, or your balance once signed in */
export function Nav({ action }: { action?: React.ReactNode }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bal = useQuery({
    queryKey: ["bal", w.address],
    queryFn: () => usdcBalance(w.address!),
    enabled: !!w.address,
    refetchInterval: 10_000,
  });
  // testnet: a signed-in wallet with under $1 gets $10 from our drip, once, without asking
  const qc = useQueryClient();
  const drip = useQuery({
    queryKey: ["drip", w.address],
    queryFn: async () => {
      const sent = await requestDrip(w.address!, w.token());
      if (sent) await qc.invalidateQueries({ queryKey: ["bal", w.address] });
      return sent;
    },
    enabled: NETWORK === "testnet" && !!w.address && bal.data !== undefined && bal.data < 1,
    staleTime: Infinity,
    retry: false,
  });
  const money = drip.isFetching ? "+$10…" : bal.data === undefined ? "…" : usd(Math.floor(bal.data * 100) / 100);

  async function copy() {
    try { await navigator.clipboard.writeText(w.address!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <div className="shell">
      <nav className="bar">
        <Logo />
        <div className="bar-right">
          {action}
          {w.on && w.ready && (w.address ? (
            <button className="me" onClick={() => setOpen(true)} aria-label="your wallet" data-tip={drip.isFetching ? "sending you $10 of test usdc" : drip.data ? `$${drip.data} of test usdc sent to you` : undefined}>
              <i />{money}
            </button>
          ) : (
            <button className="btn sm ghost" onClick={w.signIn}>sign in</button>
          ))}
        </div>
      </nav>
      <Sheet open={open} onClose={() => setOpen(false)} label="your wallet">
        <h2 className="giant">{money}</h2>
        <div className="linkbox">
          <code>{w.address}</code>
          <button className="btn sm" onClick={copy}>{copied ? "copied" : "copy"}</button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {NETWORK === "testnet"
            ? drip.error ? `${drip.error.message}. or get test usdc at faucet.circle.com` : "testnet. new wallets get $10 of test usdc automatically"
            : "send usdc on arc to this address"}
        </p>
        <button className="btn lg ghost wide" onClick={() => { setOpen(false); w.signOut(); }}>sign out</button>
      </Sheet>
    </div>
  );
}
