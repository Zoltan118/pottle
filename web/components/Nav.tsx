"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { balanceOf, requestDrip, usdcBalance } from "@/lib/wallet";
import { NETWORK } from "@/lib/config";
import { money, potPath, readPotsOf, timeLeft, usd, type PotData } from "@/lib/pot";
import { Logo } from "./Mark";
import { Sheet } from "./Sheet";
import { AddMoney, ONRAMP_ON } from "./AddMoney";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** logo left; right: the page's own action plus sign in, or your balance once signed in */
export function Nav({ action }: { action?: React.ReactNode }) {
  const w = useWallet();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const bal = useQuery({
    queryKey: ["bal", w.address],
    queryFn: () => usdcBalance(w.address!),
    enabled: !!w.address,
    refetchInterval: 10_000,
  });
  // testnet: a signed-in wallet with under $1 gets $10 from our drip, once, without asking
  const drip = useQuery({
    queryKey: ["drip", w.address],
    queryFn: async () => {
      const sent = await requestDrip(w.address!, w.authHeader());
      if (sent) await qc.invalidateQueries({ queryKey: ["bal", w.address] });
      if (sent) await qc.invalidateQueries({ queryKey: ["eur", w.address] });
      return sent;
    },
    enabled: NETWORK === "testnet" && !!w.address && bal.data !== undefined && bal.data < 1,
    staleTime: Infinity,
    retry: false,
  });
  const eur = useQuery({
    queryKey: ["eur", w.address],
    queryFn: () => balanceOf(w.address!, "eur"),
    enabled: !!w.address && open,
    refetchInterval: 10_000,
  });
  const pots = useQuery({
    queryKey: ["pots", w.address],
    queryFn: () => readPotsOf(w.address!),
    enabled: !!w.address && open,
  });

  const chip = drip.isFetching ? "+$10…" : bal.data === undefined ? "…" : usd(Math.floor(bal.data * 100) / 100);
  const eurMoney = (d: number) => money(Math.floor(d * 100) / 100, "eur");

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  /** phones get the native share sheet (whatsapp, messages), desktops copy the link */
  async function share(p: PotData) {
    const url = `${location.origin}${potPath(p.id)}`;
    if (navigator.share) {
      try { await navigator.share({ title: p.title, text: `chip in for ${p.title}`, url }); return; } catch { return; }
    }
    copy(url, `pot-${p.id}`);
  }

  return (
    <div className="shell">
      <nav className="bar">
        <Logo />
        <div className="bar-right">
          {action}
          {w.on && w.ready && (w.address ? (
            <button className="me" onClick={() => setOpen(true)} aria-label="your account" data-tip={drip.isFetching ? "sending you $10 of test usdc" : undefined}>
              <i />{chip}
            </button>
          ) : (
            <button className="btn sm ghost" onClick={w.signIn}>sign in</button>
          ))}
        </div>
      </nav>

      <Sheet open={open} onClose={() => setOpen(false)} label="your account">
        <div className="acct-top">
          <button className="addr" onClick={() => w.address && copy(w.address, "addr")} aria-label="copy your address">
            <i />{w.address ? short(w.address) : ""}<span>{copied === "addr" ? "copied" : "copy"}</span>
          </button>
          <button className="iconbtn" onClick={() => setOpen(false)} aria-label="close">×</button>
        </div>

        <div className="acct-bal">{chip}<small>usdc on arc</small></div>
        {!!eur.data && eur.data > 0 && <div className="acct-bal2">{eurMoney(eur.data)}<small>eurc on arc</small></div>}

        {ONRAMP_ON
          ? <AddMoney onDone={() => qc.invalidateQueries({ queryKey: ["bal", w.address] })} />
          : NETWORK === "testnet" && (
              <p className="hint acct-note">
                {drip.error ? `${drip.error.message}. test usdc: faucet.circle.com` : "testnet. new wallets get $10 of test usdc"}
              </p>
            )}

        <div className="acct-pots">
          <span className="label">your pots</span>
          {pots.isLoading && <p className="hint">…</p>}
          {pots.data?.length === 0 && (
            <div className="acct-empty">
              <p className="hint">no pots yet</p>
              <Link className="btn sm" href="/new" onClick={() => setOpen(false)}>make a pot</Link>
            </div>
          )}
          {pots.data?.map((p) => (
            <div className="acct-pot" key={p.id}>
              <Link href={potPath(p.id)} onClick={() => setOpen(false)} className="acct-pot-main">
                <b>{p.title}</b>
                <span>{money(p.raised, p.currency)} of {money(p.goal, p.currency)} · {p.status === "open" ? timeLeft(p.deadline) : p.status === "released" ? "paid out" : p.status === "refunding" ? "ended" : "goal hit"}{p.organiser.toLowerCase() === w.address?.toLowerCase() ? "" : " · you're in"}</span>
              </Link>
              <button className="btn sm" onClick={() => share(p)}>{copied === `pot-${p.id}` ? "copied" : "share"}</button>
            </div>
          ))}
        </div>

        <button className="btn lg ghost wide" onClick={() => { setOpen(false); w.signOut(); }}>sign out</button>
      </Sheet>
    </div>
  );
}
