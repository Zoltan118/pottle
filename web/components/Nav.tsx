"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { balanceOf, requestDrip, usdcBalance } from "@/lib/wallet";
import { NETWORK } from "@/lib/config";
import { money, potPath, readPotsOf, timeLeft, usd, type PotData } from "@/lib/pot";
import { Logo } from "./Mark";
import { NetSwitch } from "./NetSwitch";
import { afterSheetsClose, Sheet } from "./Sheet";
import { HomeScreenTip } from "./HomeScreenTip";
import { AddMoney, ONRAMP_ON } from "./AddMoney";
import { CashOut } from "./CashOut";
import { Receive } from "./Receive";
import { Lock, useLock } from "./Lock";
import { ArrowOutIcon, CloseIcon, CopyIcon, ExitIcon, InIcon, LockIcon, NextIcon, PlusIcon, ShareIcon } from "./Icons";


/** logo left; right: the page's own action plus sign in, or your balance once signed in */
export function Nav({ action }: { action?: React.ReactNode }) {
  const w = useWallet();
  const qc = useQueryClient();
  const router = useRouter();
  // a link inside the account sheet: close the sheet, then go once its history step is back
  const go = (href: string) => (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); close(); afterSheetsClose(() => router.push(href)); };
  const [open, setOpen] = useState(false);
  // the account sheet's screens: the account itself, and the ones its actions open
  const [view, setView] = useState<"main" | "cash" | "receive" | "lock" | "add">("main");
  const close = () => { setOpen(false); setView("main"); };
  const back = () => setView("main");
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


  // whole dollars from $100 up, so the chip never pushes the nav wider than a phone
  const exact = bal.data === undefined ? "…" : usd(Math.floor(bal.data * 100) / 100);
  const chip = drip.isFetching ? "+$10…" : bal.data === undefined ? "…" : bal.data >= 100 ? usd(Math.floor(bal.data)) : exact;
  const eurMoney = (d: number) => money(Math.floor(d * 100) / 100, "eur");

  const lock = useLock(w.address); // face id sign-in: offered, and whether this account has a passkey
  const lockCard = (
    <Lock onRelogin={() => {
      // close this sheet first; the sign-in sheet opens once it has slid away (its back-button step too)
      close();
      window.setTimeout(async () => { await w.signOut(); void w.signIn(); }, 450);
    }} />
  );

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
          <NetSwitch />
          {action}
          {w.on && (!w.ready && w.wasSignedIn && !w.waiting ? (
            <span className="me" aria-label="loading your account"><i />…</span>
          ) : w.address ? (
            <button className="me" onClick={() => setOpen(true)} aria-label="your account" data-tip={drip.isFetching ? "sending you $10 of test usdc" : undefined}>
              <i />{chip}
            </button>
          ) : (
            // shown straight away: a tap before sign-in has loaded is remembered, and it opens when ready
            <button className="btn sm ghost" onClick={() => void w.signIn()} aria-busy={w.waiting}>{w.waiting && !w.ready ? "one sec…" : "sign in"}</button>
          ))}
        </div>
      </nav>

      <Sheet open={open} onClose={close} label="your account" closeButton={false}>
        {view === "cash" ? <CashOut onBack={back} onClose={close} />
        : view === "receive" ? <Receive onBack={back} onClose={close} />
        : view === "lock" || view === "add" ? (
          <div className="cash">
            <div className="cash-head">
              <button className="linkbtn" onClick={back}>← your account</button>
              <button className="iconbtn" onClick={close} aria-label="close"><CloseIcon /></button>
            </div>
            {view === "lock" ? lockCard : <>
              {/* without card payments: where money comes from. on mainnet, from an exchange; on testnet, free test money */}
              <h2 className="giant cash-title">add money.</h2>
              {NETWORK === "mainnet" ? <>
                <p className="cash-lead">buying by card is coming. for now, withdraw <b>usdc</b> or <b>eurc</b> from your exchange on the <b>arc</b> network to your address.</p>
                <button className="btn lg wide" onClick={() => setView("receive")}>show my address</button>
              </> : <p className="cash-lead">{drip.error
                ? <>{drip.error.message}. get free test usdc at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com ↗</a>, pick arc testnet, and send it to your address under receive.</>
                : <>this is the test site. new wallets get <b>$10</b> of test usdc by themselves. for more, use <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com ↗</a> (pick arc testnet) and your address under receive.</>}</p>}
            </>}
          </div>
        ) : <>
        <div className="acct-head">
          <div className="acct-money">
            <div className="acct-bal">{exact}</div>
            <div className="acct-sub">{!!eur.data && eur.data > 0 ? <><b>+ {eurMoney(eur.data)}</b> · usdc and eurc on arc</> : "usdc on arc"}</div>
          </div>
          <button className="iconbtn" onClick={close} aria-label="close"><CloseIcon /></button>
        </div>

        {/* money in and out side by side, as equals. add is the one accent on the sheet */}
        <div className="acts-row">
          {ONRAMP_ON
            ? <AddMoney round active={open && view === "main"} onDone={() => qc.invalidateQueries({ queryKey: ["bal", w.address] })} />
            : <button className="act act-main" onClick={() => setView("add")}><span className="act-ic"><PlusIcon /></span>add</button>}
          <button className="act" onClick={() => setView("cash")}><span className="act-ic"><ArrowOutIcon /></span>cash out</button>
          <button className="act" onClick={() => setView("receive")}><span className="act-ic"><InIcon /></span>receive</button>
        </div>

        <div className="acct-pots">
          <span className="label">your pots</span>
          {pots.isLoading && <p className="hint">…</p>}
          {pots.data?.length === 0 && (
            <div className="acct-empty">
              <p className="hint">no pots yet</p>
              <Link className="btn sm" href="/new" onClick={go("/new")}>make a pot</Link>
            </div>
          )}
          {pots.data?.map((p) => (
            <div className="acct-pot" key={p.id}>
              <Link href={potPath(p.id)} onClick={go(potPath(p.id))} className="acct-pot-main">
                <b>{p.title}</b>
                <span>{money(p.raised, p.currency)} of {money(p.goal, p.currency)} · {p.status === "open" ? timeLeft(p.deadline) : p.status === "released" ? "paid out" : p.status === "refunding" ? "ended" : "goal hit"}{p.organiser.toLowerCase() === w.address?.toLowerCase()
                    ? (p.status === "released" ? " · paid to you" : p.status === "refunding" ? (p.raised > 0 ? " · yours, refunding" : " · yours, refunded") : " · yours")
                    // "refunded" only once the money is back (nothing left in the pot), not while refunds are under way
                    : (p.status === "refunding" ? (p.raised > 0 ? " · refunding" : " · refunded to you") : " · you're in")}</span>
              </Link>
              <button className="iconbtn acct-share" onClick={() => share(p)} aria-label={copied === `pot-${p.id}` ? "link copied" : `share ${p.title}`}>
                {copied === `pot-${p.id}` ? <CopyIcon done /> : <ShareIcon />}
              </button>
            </div>
          ))}
        </div>

        {/* settings: quiet rows, so the sheet reads money, then pots, then the rest */}
        <div className="acct-rows">
          {lock.offered.data && (
            <button className="acct-row" onClick={() => setView("lock")}>
              <LockIcon />face id sign-in
              <span className="acct-row-end">
                {lock.list.data ? (lock.list.data.length ? "on" : "off") : lock.list.error ? "check" : "…"}
                <NextIcon />
              </span>
            </button>
          )}
          <HomeScreenTip row />
          <button className="acct-row acct-out" onClick={() => { close(); w.signOut(); }}><ExitIcon />sign out</button>
        </div>
        </>}
      </Sheet>
    </div>
  );
}
