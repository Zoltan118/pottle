"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/app/providers";
import { createPot } from "@/lib/wallet";
import { missingEnv, TOKEN, type Currency } from "@/lib/config";
import { WRAPS, type Wrap } from "@/lib/pot";
import { fitBytes, MAX_NAME_BYTES, MAX_TITLE_BYTES } from "@/lib/text";

const UNTIL = ["friday", "sunday", "1 week", "2 weeks"] as const;
type Until = (typeof UNTIL)[number];

/** friday and sunday mean the next one at 18:00 local, at least an hour away */
function deadlineFor(u: Until): number {
  const now = new Date();
  if (u === "1 week" || u === "2 weeks") return Math.floor(now.getTime() / 1000) + (u === "1 week" ? 7 : 14) * 86400;
  const target = u === "friday" ? 5 : 0;
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  if (d.getTime() - now.getTime() < 3600_000) d.setDate(d.getDate() + 7);
  return Math.floor(d.getTime() / 1000);
}
const dateLabel = (u: Until) =>
  new Date(deadlineFor(u) * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const WRAP_LIST: { id: Wrap; label: string }[] = [
  { id: "confetti", label: "confetti" }, { id: "stripes", label: "ribbon" }, { id: "gingham", label: "picnic" }, { id: "plain", label: "plain" },
  { id: "hearts", label: "hearts" }, { id: "stars", label: "stars" }, { id: "waves", label: "waves" }, { id: "sprinkles", label: "sprinkles" },
];

export function CreateFlow() {
  const w = useWallet();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [currency, setCurrency] = useState<Currency>("usd");
  const [until, setUntil] = useState<Until | null>(null);
  const [wrap, setWrap] = useState<Wrap>("confetti");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [potId, setPotId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const valid = [title.trim().length > 0, +goal > 0 && +goal <= 10000, !!until, true, name.trim().length > 0][step] ?? true;
  const link = potId ? `${typeof location !== "undefined" ? location.origin : ""}/p/${potId}` : "";

  async function create() {
    if (!w.address) return w.signIn();
    setBusy(true); setErr("");
    try {
      const c = await w.client();
      const id = await createPot(c, { goal: +goal, deadline: deadlineFor(until!), wrap: WRAPS.indexOf(wrap), currency, title: fitBytes(title.trim(), MAX_TITLE_BYTES), name: fitBytes(name.trim().toLowerCase(), MAX_NAME_BYTES) });
      setPotId(id); setStep(5);
    } catch (e) {
      setErr(e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong");
    } finally { setBusy(false); }
  }

  function next() {
    if (!valid) return;
    if (step === 4) create(); else setStep(step + 1);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }

  const nextLabel = step < 4 ? "next →" : busy ? "creating…" : w.address ? "create pot" : "sign in";

  return (
    <main className="view">
      <div className="shell">
        <nav className="bar">
          <button className="iconbtn" onClick={() => setStep(Math.max(0, step - 1))} aria-label="back" style={{ visibility: step === 0 || step === 5 ? "hidden" : "visible" }}>←</button>
          <div className="steps" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < step || step === 5 ? "done" : ""} />)}</div>
          <Link className="iconbtn" href="/" aria-label="close">×</Link>
        </nav>
      </div>

      {step === 0 && (
        <section className="flow">
          <h1 className="giant q">for?</h1>
          <input className="bigin" placeholder="sarah's gift" autoFocus value={title} onChange={(e) => setTitle(fitBytes(e.target.value, MAX_TITLE_BYTES))} onKeyDown={(e) => e.key === "Enter" && next()} aria-label="what the pot is for" enterKeyHint="next" />
          <div className="chips">{["birthday", "leaving gift", "trip", "dinner"].map((t) => <button key={t} className="chip" onClick={() => setTitle(t)}>{t}</button>)}</div>
        </section>
      )}

      {step === 1 && (
        <section className="flow">
          <h1 className="giant q">goal?</h1>
          <label className="money"><span>{TOKEN[currency].symbol}</span><input className="bigin" inputMode="numeric" placeholder="200" maxLength={5} autoFocus value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && next()} aria-label="goal in dollars" enterKeyHint="next" /></label>
          <div className="chips">{["50", "100", "200", "500"].map((g) => <button key={g} className="chip" aria-pressed={goal === g} onClick={() => setGoal(g)}>{TOKEN[currency].symbol}{g}</button>)}</div>
          <div className="cur" role="group" aria-label="currency">
            <button className="chip" aria-pressed={currency === "usd"} onClick={() => setCurrency("usd")} data-tip="friends chip in usdc">$ dollars</button>
            <button className="chip" aria-pressed={currency === "eur"} onClick={() => setCurrency("eur")} data-tip="friends chip in eurc">€ euros</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flow">
          <h1 className="giant q">until?</h1>
          <div className="chips" role="group" aria-label="deadline">
            {UNTIL.map((u) => <button key={u} className="chip" aria-pressed={until === u} data-tip={dateLabel(u)} onClick={() => setUntil(u)}>{u}</button>)}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flow">
          <h1 className="giant q">wrap?</h1>
          <div className="wraps" role="group" aria-label="pot wrap">
            {WRAP_LIST.map((x) => <button key={x.id} className={`wrapchoice w-${x.id}`} aria-pressed={wrap === x.id} aria-label={x.label} data-tip={x.label} onClick={() => setWrap(x.id)} />)}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="flow">
          <h1 className="giant q">you?</h1>
          <input className="bigin" placeholder="your name" autoFocus value={name} onChange={(e) => setName(fitBytes(e.target.value, MAX_NAME_BYTES))} onKeyDown={(e) => e.key === "Enter" && next()} aria-label="your name" enterKeyHint="go" autoComplete="given-name" />
          <p className="hint" style={{ margin: 0 }}>the pot is paid to you, to buy the gift. chip in your own share too if you&apos;re part of it.</p>
          {missingEnv.length > 0 && <div className="notice">setup needed: <code>{missingEnv.join(", ")}</code> in <code>.env.local</code></div>}
          <div className="err" role="alert">{err}</div>
        </section>
      )}

      {step === 5 && (
        <section className="flow">
          <h1 className="giant q">ready.</h1>
          <div className="linkbox"><code>{link.replace(/^https?:\/\//, "")}</code><button className="btn sm" onClick={copy}>{copied ? "copied" : "copy"}</button></div>
          <div><a className="btn lg ghost" href={link}>open pot</a></div>
        </section>
      )}

      {step < 5 && (
        <div className="shell flownav">
          <span className="hint">{step + 1} of 5</span>
          <button className="btn lg" onClick={next} disabled={!valid || busy}>{nextLabel}</button>
        </div>
      )}
    </main>
  );
}
