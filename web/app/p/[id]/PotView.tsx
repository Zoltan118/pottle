"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { Nav } from "@/components/Nav";
import { PotLive, type PotFeed } from "@/components/PotLive";
import { Sheet } from "@/components/Sheet";
import { chipIn, settle, usdcBalance } from "@/lib/wallet";
import { readPot, timeLeft, usd, type PotData } from "@/lib/pot";

const AMOUNTS = [5, 10, 20, 50];

export function PotView({ initial }: { initial: PotData }) {
  const w = useWallet();
  const qc = useQueryClient();
  const feedRef = useRef<PotFeed | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const { data: pot = initial } = useQuery({
    queryKey: ["pot", initial.id],
    // each refresh is compared with the last one, and whatever changed is played on the pot
    queryFn: async () => {
      const next = (await readPot(initial.id)) ?? initial;
      const prev = qc.getQueryData<PotData>(["pot", initial.id]);
      if (prev && feedRef.current) {
        const level = next.goal ? next.raised / next.goal : 0;
        for (const p of next.people) {
          const before = prev.people.find((q) => q.address === p.address)?.amount ?? 0;
          if (p.amount > before) { feedRef.current.drop(`${p.name} · ${usd(p.amount - before)}`, level); setFresh(p.name); }
        }
        if (next.raised < prev.raised) feedRef.current.refund(level);
        if ((next.status === "reached" || next.status === "released") && prev.status === "open") setTimeout(() => feedRef.current?.celebrate(), 500);
      }
      return next;
    },
    initialData: initial,
    refetchInterval: 5_000,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(20);
  const [busy, setBusy] = useState<"" | "pay" | "settle">("");
  const [err, setErr] = useState("");

  const paid = pot.people;
  const missing = Math.max(0, Math.ceil((pot.goal - pot.raised) / amount));
  const refreshed = () => qc.invalidateQueries({ queryKey: ["pot", pot.id] });
  const message = (e: unknown) =>
    e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong";

  async function pay() {
    if (!w.address) return w.signIn();
    setBusy("pay"); setErr("");
    try {
      const bal = await usdcBalance(w.address);
      if (bal < amount) throw new Error(`you have ${usd(Math.floor(bal * 100) / 100)}. add usdc on arc to chip in ${usd(amount)}.`);
      const c = await w.client();
      const nm = name.trim().toLowerCase() || "friend";
      await chipIn(c, { id: pot.id, amount, name: nm });
      setOpen(false); setName("");
      refreshed();
    } catch (e) { setErr(message(e)); } finally { setBusy(""); }
  }

  async function doSettle(kind: "release" | "refund") {
    setBusy("settle"); setErr("");
    try {
      const c = w.address ? await w.client() : undefined;
      await settle(kind, pot.id, c);
      refreshed();
    } catch (e) { setErr(message(e)); } finally { setBusy(""); }
  }

  const refundedAll = pot.status === "refunding" && pot.raised === 0;

  return (
    <main className={`view w-${pot.wrap}`}>
      <Nav action={<Link className="btn sm ghost hide-sm" href="/new">make your own</Link>} />
      <section className="shell potpage">
        <div className="plate">
          <h1 className="giant">{pot.title}</h1>
          <div className="amount">{usd(pot.raised)}<small>of {usd(pot.goal)}</small></div>
          <div className="meta">
            <span><b>{paid.length}</b> in</span>
            <span><b>{pot.status === "released" ? "paid out" : pot.status === "refunding" ? "ended" : pot.status === "reached" ? "goal hit" : timeLeft(pot.deadline)}</b></span>
            <button className="tipword" style={{ color: "var(--muted)" }} data-tip={`nobody can take this early. hit ${usd(pot.goal)} and it goes to ${pot.organiserName}. miss it and everyone gets their money back.`}>safe?</button>
          </div>

          <div className="faces" aria-label={`${paid.length} people in`}>
            {paid.slice(0, 8).map((p) => (
              <span key={p.address} className={`face${p.name === fresh ? " new" : ""}`} data-tip={`${p.name} · ${usd(p.amount)}`} tabIndex={0}>{p.name[0]}</span>
            ))}
            {paid.length > 8 && <span className="face more" data-tip={paid.slice(8).map((p) => p.name).join(", ")} tabIndex={0}>+{paid.length - 8}</span>}
            {pot.status === "open" && Array.from({ length: Math.min(missing, 3) }, (_, i) => <span key={i} className="face out" aria-hidden="true">?</span>)}
          </div>

          {pot.status === "open" && <button className="btn lg wide" onClick={() => setOpen(true)}>i&apos;m in · {usd(amount)}</button>}
          {pot.status === "reached" && (
            <>
              <p className="state ok">goal hit.</p>
              <button className="btn lg wide" onClick={() => doSettle("release")} disabled={!!busy}>{busy ? "sending…" : `send it to ${pot.organiserName}`}</button>
            </>
          )}
          {pot.status === "released" && <p className="state ok">it&apos;s on. {usd(pot.raised)} went to {pot.organiserName}.</p>}
          {pot.status === "refunding" && (refundedAll
            ? <p className="state back">missed. everyone got their money back.</p>
            : <>
                <p className="state back">missed the goal.</p>
                <button className="btn lg wide" onClick={() => doSettle("refund")} disabled={!!busy}>{busy ? "refunding…" : "refund everyone"}</button>
              </>)}
          <div className="err" role="alert">{!open && err}</div>
        </div>
        <PotLive people={initial.people} goal={pot.goal} level={pot.goal ? pot.raised / pot.goal : 0} status={initial.status} feedRef={feedRef} />
      </section>
      <div className="shell potfoot"><Link className="btn sm ghost" href="/new">make your own pot</Link></div>

      <Sheet open={open} onClose={() => { setOpen(false); setErr(""); }} label="chip in">
        <h2 className="giant">you&apos;re in?</h2>
        <input className="bigin" placeholder="your name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pay()} aria-label="your name" enterKeyHint="go" autoComplete="given-name" />
        <div className="chips" role="group" aria-label="amount">
          {AMOUNTS.map((a) => <button key={a} className="chip" aria-pressed={amount === a} onClick={() => setAmount(a)}>{usd(a)}</button>)}
        </div>
        <button className="btn lg wide" onClick={pay} disabled={!!busy || !w.on}>
          {busy === "pay" ? "paying…" : w.address ? `pay ${usd(amount)}` : "sign in to pay"}
        </button>
        <div className="err" role="alert">{open && err}</div>
      </Sheet>
    </main>
  );
}
