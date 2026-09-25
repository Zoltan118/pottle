"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { Nav } from "@/components/Nav";
import { PotLive, type PotFeed } from "@/components/PotLive";
import { AddMoney, ONRAMP_ON } from "@/components/AddMoney";
import { Sheet } from "@/components/Sheet";
import { balanceOf, chipIn, settle } from "@/lib/wallet";
import { chipOptions, MAX_POT, MIN_CHIP, money, payoutStuck, readPot, timeLeft, type PotData } from "@/lib/pot";
import { fitBytes, MAX_NAME_BYTES } from "@/lib/text";
import { NETWORK, TOKEN } from "@/lib/config";


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
          if (p.amount > before) { feedRef.current.drop(`${p.name} · ${money(p.amount - before, next.currency)}`, level); setFresh(p.name); }
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
  const [picked, setPicked] = useState<number | "other">(20);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"" | "pay" | "settle">("");
  const [err, setErr] = useState("");
  const [short, setShort] = useState(0); // how much the payer is missing, offered as "add money"

  const m = (d: number) => money(d, pot.currency);
  const isOrganiser = (a: string) => a.toLowerCase() === pot.organiser.toLowerCase();
  const paid = pot.people;
  const latest = fresh ?? paid.at(-1)?.name;
  // one-tap amounts fitted to what the pot still needs (the last is exactly "the rest"), or any amount typed in
  const { left, room, picks } = chipOptions(pot.goal, pot.raised, MAX_POT);
  const fallback = picks.includes(20) ? 20 : (picks.filter((a) => a <= 20).at(-1) ?? picks[0] ?? 0);
  const other = picked === "other";
  const amount = other ? Number(typed) || 0 : picks.includes(picked) ? picked : fallback;
  const tooSmall = amount > 0 && amount < MIN_CHIP && amount !== left;
  const tooBig = amount > room;
  const valid = amount > 0 && !tooSmall && !tooBig;
  const missing = amount ? Math.max(0, Math.ceil((pot.goal - pot.raised) / amount)) : 0;
  const refreshed = () => qc.invalidateQueries({ queryKey: ["pot", pot.id] });
  const message = (e: unknown) =>
    e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong";

  async function pay() {
    if (!w.address) return w.signIn();
    if (!valid) return;
    setBusy("pay"); setErr(""); setShort(0);
    try {
      const bal = await balanceOf(w.address, pot.currency);
      if (bal < amount) {
        setShort(Math.ceil((amount - bal) * 100) / 100);
        throw new Error(`you have ${m(Math.floor(bal * 100) / 100)}, ${m(amount)} needed.${ONRAMP_ON ? "" : ` add ${TOKEN[pot.currency].name.toLowerCase()} on arc to chip in.`}`);
      }
      const c = await w.client();
      const nm = fitBytes(name.trim().toLowerCase(), MAX_NAME_BYTES) || "friend";
      await chipIn(c, { id: pot.id, amount, name: nm, currency: pot.currency });
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
  const [qr, setQr] = useState<string | null>(null);
  const [shared, setShared] = useState("");
  const url = () => `${location.origin}/p/${pot.id}`;

  /** phones open the share sheet with the message ready; desktops copy it */
  async function send(text: string, label: string) {
    const full = `${text} ${url()}`;
    if (navigator.share) { try { await navigator.share({ text, url: url() }); } catch {} return; }
    try { await navigator.clipboard.writeText(full); setShared(label); setTimeout(() => setShared(""), 1600); } catch {}
  }
  const nudge = () => {
    const left = Math.max(0, pot.goal - pot.raised);
    send(`${m(left)} to go for ${pot.title}, ${timeLeft(pot.deadline)} 👀 chip in:`, "nudge");
  };
  const thanks = () => send(`${paid.length} friend${paid.length === 1 ? "" : "s"} chipped in ${m(pot.raised)} for ${pot.title} 🎁 thank you!`, "thanks");
  async function showQr() {
    const { toString } = await import("qrcode");
    setQr(await toString(url(), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#231A33", light: "#FFFFFF" } }));
  }

  return (
    <main className={`view w-${pot.wrap}`}>
      <Nav action={<Link className="btn sm ghost hide-sm" href="/new">make your own</Link>} />
      <section className="shell potpage">
        <div className="plate">
          <h1 className="giant">{pot.title}</h1>
          <div className="amount">{m(pot.raised)}<small>of {m(pot.goal)}</small></div>
          <button className="goesto" data-tip={`${pot.organiserName} made this pot. hit ${m(pot.goal)} and all of it goes to ${pot.organiserName} for ${pot.title}. miss it and everyone gets their money back.`}>
            {pot.status === "released" ? "went to" : "goes to"} <b>{pot.organiserName}</b>
          </button>
          <div className="meta">
            <span><b>{paid.length}</b> in</span>
            <span><b>{pot.status === "released" ? "paid out" : pot.status === "refunding" ? "ended" : pot.status === "reached" ? "goal hit" : timeLeft(pot.deadline)}</b></span>
            <button className="tipword" style={{ color: "var(--muted)" }} data-tip={`nobody can take this early. hit ${m(pot.goal)} and it goes to ${pot.organiserName}. miss it and everyone gets their money back.${NETWORK === "mainnet" ? ` pottle is in beta with no third-party audit yet, so each pot holds at most ${m(MAX_POT)}.` : ""}`}>safe?</button>
          </div>

          <div className="faces" aria-label={`${paid.length} people in`}>
            {paid.slice(0, 8).map((p) => (
              <span key={p.address} className={`face${p.name === fresh ? " new" : ""}${isOrganiser(p.address) ? " org" : ""}`} data-tip={`${p.name}${isOrganiser(p.address) ? " · organiser" : ""} · ${m(p.amount)}`} tabIndex={0}>{p.name[0]}</span>
            ))}
            {paid.length > 8 && <span className="face more" data-tip={paid.slice(8).map((p) => p.name).join(", ")} tabIndex={0}>+{paid.length - 8}</span>}
            {pot.status === "open" && Array.from({ length: Math.min(missing, 3) }, (_, i) => <span key={i} className="face out" aria-hidden="true">?</span>)}
          </div>

          {pot.status === "open" && latest && <p className="latest">latest: <b>{latest}</b></p>}
          {pot.status === "open" && (
            <div className="potcta">
              {/* phones: the pinned bar carries the progress, so it still reads when the card has scrolled away */}
              <div className="potcta-meta" aria-hidden="true">
                <span className="potcta-track"><i style={{ width: `${Math.min(100, pot.goal ? (pot.raised / pot.goal) * 100 : 0)}%` }} /></span>
                <span><b>{m(pot.raised)}</b> of {m(pot.goal)} · {paid.length} in</span>
              </div>
              <div className="potcta-row">
                <button className="btn lg ghost potcta-share" onClick={nudge} aria-label="share this pot">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button className="btn lg wide" onClick={() => setOpen(true)}>{valid ? <>i&apos;m in · {m(amount)}</> : <>i&apos;m in</>}</button>
              </div>
            </div>
          )}
          {pot.status === "reached" && (
            <>
              <p className="state ok">goal hit.</p>
              <button className="btn lg wide" onClick={() => doSettle("release")} disabled={!!busy}>{busy ? "sending…" : `send it to ${pot.organiserName}`}</button>
              {payoutStuck(pot) && (
                <button className="btn sm ghost" onClick={() => doSettle("refund")} disabled={!!busy}
                  data-tip="this pot couldn't pay out for 30 days after its deadline, so everyone can take their money back.">payout stuck? refund everyone</button>
              )}
            </>
          )}
          {pot.status === "released" && <p className="state ok">it&apos;s on. {m(pot.raised)} went to {pot.organiserName}.</p>}
          {pot.status === "refunding" && (refundedAll
            ? <p className="state back">missed. everyone got their money back.</p>
            : <>
                <p className="state back">missed the goal.</p>
                <button className="btn lg wide" onClick={() => doSettle("refund")} disabled={!!busy}>{busy ? "refunding…" : "refund everyone"}</button>
              </>)}
          <div className="acts">
            {(pot.status === "open" || pot.status === "reached") && <button className="btn sm ghost" onClick={nudge} data-tip="send the group a reminder">{shared === "nudge" ? "copied" : "nudge"}</button>}
            {pot.status === "released" && <button className="btn sm" onClick={thanks} data-tip="share the thank-you card">{shared === "thanks" ? "copied" : "share the thank-you"}</button>}
            <button className="btn sm ghost" onClick={showQr} data-tip="scan to chip in">qr</button>
          </div>
          <div className="err" role="alert">{!open && err}</div>
        </div>
        <PotLive people={initial.people} goal={pot.goal} level={pot.goal ? pot.raised / pot.goal : 0} status={initial.status} currency={initial.currency} feedRef={feedRef} />
      </section>
      <div className="shell potfoot"><Link className="btn sm ghost" href="/new">make your own pot</Link></div>

      <Sheet open={!!qr} onClose={() => setQr(null)} label="scan to chip in">
        <h2 className="giant">scan.</h2>
        {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
        <p className="hint" style={{ margin: 0 }}>{pot.title} · {m(pot.raised)} of {m(pot.goal)}</p>
      </Sheet>

      <Sheet open={open} onClose={() => { setOpen(false); setErr(""); setShort(0); }} label="chip in">
        <h2 className="giant">you&apos;re in?</h2>
        <input className="bigin" placeholder="your name" value={name} onChange={(e) => setName(fitBytes(e.target.value, MAX_NAME_BYTES))} onKeyDown={(e) => e.key === "Enter" && pay()} aria-label="your name" enterKeyHint="go" autoComplete="given-name" />
        <div className="chips" role="group" aria-label="amount">
          {picks.map((a) => <button key={a} className="chip" aria-pressed={!other && amount === a} onClick={() => setPicked(a)}>{m(a)}</button>)}
          <button className="chip" aria-pressed={other} onClick={() => setPicked("other")}>other</button>
        </div>
        {other && (
          <label className="money typed">
            <span>{TOKEN[pot.currency].symbol}</span>
            <input className="bigin" inputMode="decimal" placeholder={String(Math.min(left || 10, room))} autoFocus value={typed} aria-label="amount"
              onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) setTyped(v); }}
              onKeyDown={(e) => e.key === "Enter" && pay()} enterKeyHint="go" />
          </label>
        )}
        <p className="where">
          {tooBig ? <>this pot can take at most <b>{m(room)}</b> more.</>
            : tooSmall ? <>at least {m(MIN_CHIP)}, please.</>
            : amount > 0 && amount === left ? <>that&apos;s exactly what&apos;s left. it hits the goal and goes to <b>{pot.organiserName}</b>.</>
            : amount > left && left > 0 ? <>that&apos;s {m(Math.round((amount - left) * 100) / 100)} over the goal. the extra goes to <b>{pot.organiserName}</b> too.</>
            : w.address && w.address.toLowerCase() === pot.organiser.toLowerCase()
            ? <>this is your pot. your {m(amount)} comes back to you with the rest if it hits {m(pot.goal)}.</>
            : <>{m(left)} to go. it goes to <b>{pot.organiserName}</b> if the pot hits {m(pot.goal)}, back to you if it doesn&apos;t.</>}
        </p>
        <button className="btn lg wide" onClick={pay} disabled={!!busy || !w.on || (!!w.address && !valid)}>
          {busy === "pay" ? "paying…" : !w.address ? "sign in to pay" : valid ? `pay ${m(amount)}` : "pick an amount"}
        </button>
        <div className="err" role="alert">{open && err}</div>
        {open && short > 0 && ONRAMP_ON && (
          <AddMoney currency={pot.currency} amount={short} label={`add ${m(short)} by card`} onDone={() => { setShort(0); setErr(""); }} />
        )}
      </Sheet>
    </main>
  );
}
