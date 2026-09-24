"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { Nav } from "@/components/Nav";
import { PotArt } from "@/components/PotArt";
import { Sheet } from "@/components/Sheet";
import { chipIn, settle, usdcBalance } from "@/lib/wallet";
import { readPot, timeLeft, usd, type PotData, type Wrap } from "@/lib/pot";

const AMOUNTS = [5, 10, 20, 50];

export function PotView({ initial, wrap }: { initial: PotData; wrap: Wrap }) {
  const w = useWallet();
  const qc = useQueryClient();
  const { data: pot = initial } = useQuery({
    queryKey: ["pot", initial.id],
    queryFn: async () => (await readPot(initial.id)) ?? initial,
    initialData: initial,
    refetchInterval: 5_000,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(20);
  const [busy, setBusy] = useState<"" | "pay" | "settle">("");
  const [err, setErr] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

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
      setFresh(nm); setOpen(false); setName("");
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
    <main className={`view w-${wrap}`}>
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
        <div className="potstage">
          <div className="potbtn static"><PotArt level={pot.goal ? pot.raised / pot.goal : 0} /></div>
        </div>
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
