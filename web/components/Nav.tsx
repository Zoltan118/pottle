"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { usdcBalance } from "@/lib/wallet";
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
  const money = bal.data === undefined ? "…" : usd(Math.floor(bal.data * 100) / 100);

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
            <button className="me" onClick={() => setOpen(true)} aria-label="your wallet">
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
          {NETWORK === "testnet" ? "testnet. free usdc at faucet.circle.com" : "send usdc on arc to this address"}
        </p>
        <button className="btn lg ghost wide" onClick={() => { setOpen(false); w.signOut(); }}>sign out</button>
      </Sheet>
    </div>
  );
}
