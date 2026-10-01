"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomeScreenTip } from "@/components/HomeScreenTip";
import { useRef, useState } from "react";
import { watchKeyboard } from "@/lib/keyboard";
import { useWallet } from "@/app/providers";
import { walletStore } from "@/lib/walletStore";
import { useMountEffect } from "@/hooks/useMountEffect";
import { createPot } from "@/lib/wallet";
import { missingEnv, NETWORK, TOKEN, type Currency } from "@/lib/config";
import { MAX_POT, money, WRAPS, type Wrap } from "@/lib/pot";
import { fitBytes, MAX_NAME_BYTES, MAX_TITLE_BYTES } from "@/lib/text";
import { BackIcon, CloseIcon, CopyIcon, ShareIcon } from "@/components/Icons";

const UNTIL = ["tonight", "tomorrow", "friday", "1 week", "pick a date"] as const;
type Until = (typeof UNTIL)[number];
const HOUR = 3600_000;
const MAX_AHEAD = 89 * 86400_000; // the contract allows 90 days; a day of margin for slow clocks

/** a quick pick under "for?" also suggests when the pot should be decided */
const SUGGEST: Record<string, Until> = { dinner: "tonight", birthday: "pick a date", "leaving gift": "pick a date", trip: "1 week" };

/** "yyyy-mm-dd" in local time, the format a date input speaks */
const toInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
/** a picked day is decided at 18:00 local, the same hour as tomorrow, friday and a week out */
const atSix = (day: string) => new Date(`${day}T18:00`);

/**
 * when a pot is decided. tonight is 23:59 today, every other day is 18:00, and every option is
 * at least an hour away, so nobody makes a pot that is over before the link is shared
 */
function deadlineFor(u: Until, picked: string, now = new Date()): Date {
  const d = new Date(now);
  if (u === "pick a date") return atSix(picked);
  if (u === "tonight") d.setHours(23, 59, 0, 0);
  else {
    d.setHours(18, 0, 0, 0);
    d.setDate(d.getDate() + (u === "tomorrow" ? 1 : u === "1 week" ? 7 : (5 - d.getDay() + 7) % 7));
    if (u === "friday" && d.getTime() - now.getTime() < HOUR) d.setDate(d.getDate() + 7);
  }
  return d.getTime() - now.getTime() < HOUR ? new Date(now.getTime() + HOUR) : d;
}
const dateLabel = (d: Date) =>
  d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const WRAP_LIST: { id: Wrap; label: string }[] = [
  { id: "confetti", label: "confetti" }, { id: "stripes", label: "ribbon" }, { id: "gingham", label: "picnic" }, { id: "plain", label: "plain" },
  { id: "hearts", label: "hearts" }, { id: "stars", label: "stars" }, { id: "waves", label: "waves" }, { id: "sprinkles", label: "sprinkles" },
];

export function CreateFlow() {
  const w = useWallet();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"" | "fwd" | "back">(""); // the first question does not slide in
  const stepNow = useRef(0); // the step on screen, for the back button to know which way it went
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [currency, setCurrency] = useState<Currency>("usd");
  const [until, setUntil] = useState<Until | null>(null);
  const [untilTouched, setUntilTouched] = useState(false);
  // "pick a date" starts on tomorrow at 18:00, and cannot go under an hour or past the contract's limit
  const [openedAt] = useState(() => Date.now()); // the clock is read once, not on every render
  // starts empty: a quick tap-through must never make a birthday pot that ends tomorrow by accident
  const [picked, setPicked] = useState("");
  // the earliest day whose 18:00 is still an hour away, and the last day inside the contract's limit
  const minPick = toInput(new Date(openedAt + HOUR + 6 * HOUR)), maxPick = toInput(new Date(openedAt + MAX_AHEAD));
  const pickedAt = atSix(picked).getTime();
  const pickedOk = !Number.isNaN(pickedAt) && pickedAt - openedAt >= HOUR && pickedAt - openedAt <= MAX_AHEAD;
  const deadline = until ? deadlineFor(until, picked, new Date(openedAt)) : null;
  const [wrap, setWrap] = useState<Wrap>("confetti");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [potId, setPotId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const valid = [title.trim().length > 0, +goal > 0 && +goal <= MAX_POT, !!until && (until !== "pick a date" || pickedOk), true, name.trim().length > 0][step] ?? true;
  const link = potId ? `${typeof location !== "undefined" ? location.origin : ""}/p/${potId}` : "";

  // one pot per tap. a ref, not state: two Enter presses can land before React re-renders
  const creating = useRef(false);
  async function create() {
    if (creating.current || created.current) return;
    creating.current = true;
    setBusy(true); setErr("");
    // not signed in yet: sign in, then create the pot without another tap
    if (!walletStore.get().address && !(await w.signIn())) { setBusy(false); creating.current = false; return; }
    try {
      const c = await walletStore.get().client(); // the live wallet, not this render's copy
      const id = await createPot(c, { goal: +goal, deadline: Math.floor(deadlineFor(until!, picked).getTime() / 1000), wrap: WRAPS.indexOf(wrap), currency, title: fitBytes(title.trim(), MAX_TITLE_BYTES), name: fitBytes(name.trim().toLowerCase(), MAX_NAME_BYTES) });
      created.current = true;
      setPotId(id); setStep(5); history.replaceState(null, "", "/new");
    } catch (e) {
      setErr(e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong");
    } finally { setBusy(false); creating.current = false; }
  }

  function next() {
    if (!valid) return;
    if (step === 4) create(); else go(step + 1);
  }

  // each step is a history entry, so a swipe back or the browser's back goes back one step and keeps
  // what was typed, instead of leaving the page and losing the pot. once the pot exists, back leaves
  const created = useRef(false);
  // phones: while the keyboard is up the page shrinks to the part still visible, so "next" sits just
  // above the keyboard and under the field, instead of behind the keyboard
  const viewRef = useRef<HTMLElement>(null);
  useMountEffect(() => watchKeyboard(viewRef.current));
  const router = useRouter();
  // the step lives in the address (/new?step=2): next.js keeps its own data in history entries, so a
  // marker there would be dropped, but the address survives
  const stepFromUrl = () => { const n = Number(new URLSearchParams(location.search).get("step")); return n >= 0 && n <= 4 ? n : 0; };
  function go(n: number) { stepNow.current = n; setDir("fwd"); setStep(n); history.pushState(null, "", `/new?step=${n}`); }
  useMountEffect(() => {
    if (location.search) history.replaceState(null, "", "/new"); // a reload or a shared link starts at the first step
    const onPop = () => {
      if (created.current) { router.push("/"); return; }
      const n = stepFromUrl();
      setDir(n < stepNow.current ? "back" : "fwd");
      stepNow.current = n;
      setStep(n);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  });

  /** phones: the share sheet (whatsapp, messages) with the link ready. desktops copy it */
  async function share() {
    if (navigator.share) { try { await navigator.share({ title, text: `chip in for ${title.trim()}`, url: link }); } catch {} return; }
    copy();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }

  const nextLabel = step < 4 ? "next →" : busy ? (w.address ? "creating…" : w.ready ? "signing in…" : "one sec…") : w.address ? "create pot" : "sign in and create";

  return (
    <main className="view" ref={viewRef}>
      <div className="shell">
        <nav className="bar">
          <button className="iconbtn" onClick={() => history.back()} aria-label="back" style={{ visibility: step === 0 || step === 5 ? "hidden" : "visible" }}><BackIcon /></button>
          <div className="steps" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < step || step === 5 ? "done" : ""} />)}</div>
          <Link className="iconbtn" href="/" aria-label="close"><CloseIcon /></Link>
        </nav>
      </div>

      {step === 0 && (
        <section className={`flow${dir ? ` slide-${dir}` : ""}`}>
          <h1 className="giant q">for?</h1>
          <input className="bigin" placeholder="sarah's gift" autoFocus value={title} onChange={(e) => setTitle(fitBytes(e.target.value, MAX_TITLE_BYTES))} onKeyDown={(e) => e.key === "Enter" && next()} aria-label="what the pot is for" enterKeyHint="next" />
          <div className="chips">{["birthday", "leaving gift", "trip", "dinner"].map((t) => <button key={t} className="chip" onClick={() => { setTitle(t); if (!untilTouched) setUntil(SUGGEST[t] ?? null); }}>{t}</button>)}</div>
        </section>
      )}

      {step === 1 && (
        <section className={`flow${dir ? ` slide-${dir}` : ""}`}>
          <h1 className="giant q">goal?</h1>
          <label className="money"><span>{TOKEN[currency].symbol}</span><input className="bigin" inputMode="decimal" placeholder="50" autoFocus value={goal} onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) setGoal(v); }} onKeyDown={(e) => e.key === "Enter" && next()} aria-label="goal in dollars" enterKeyHint="next" /></label>
          <div className="chips">{["20", "50", "75", "100"].map((g) => <button key={g} className="chip" aria-pressed={goal === g} onClick={() => setGoal(g)}>{TOKEN[currency].symbol}{g}</button>)}</div>
          <div className="cur" role="group" aria-label="currency">
            <button className="chip" aria-pressed={currency === "usd"} onClick={() => setCurrency("usd")} data-tip="friends chip in usdc">$ dollars</button>
            <button className="chip" aria-pressed={currency === "eur"} onClick={() => setCurrency("eur")} data-tip="friends chip in eurc">€ euros</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>{+goal > MAX_POT ? `up to ${TOKEN[currency].symbol}${MAX_POT.toLocaleString("en-US")} per pot${NETWORK === "mainnet" ? " while pottle is in beta" : ""}.` : ""}</p>
        </section>
      )}

      {step === 2 && (
        <section className={`flow${dir ? ` slide-${dir}` : ""}`}>
          <h1 className="giant q">until?</h1>
          <div className="chips" role="group" aria-label="deadline">
            {UNTIL.map((u) => <button key={u} className="chip" aria-pressed={until === u} onClick={() => { setUntil(u); setUntilTouched(true); }}>{u}</button>)}
          </div>
          {until === "pick a date" && (
            <input className="when" type="date" value={picked} min={minPick} max={maxPick} onChange={(e) => setPicked(e.target.value)} aria-label="decided on" />
          )}
          <p className="hint" style={{ margin: 0 }}>
            {!deadline ? "the pot is decided at this time. hit the goal by then, or everyone gets their money back."
              : until === "pick a date" && !picked ? "type the day it happens. it's decided at 18:00 that day."
              : until === "pick a date" && !pickedOk ? "pick a day from today to 90 days ahead."
              : <>decided <b>{dateLabel(deadline)}</b>. hit {money(+goal, currency)} by then or everyone gets it back.</>}
          </p>
        </section>
      )}

      {step === 3 && <div key={wrap} className={`wrapbg w-${wrap}`} aria-hidden="true" />}
      {step === 3 && (
        <section className={`flow${dir ? ` slide-${dir}` : ""}`}>
          <h1 className="giant q">wrap?</h1>
          <div className="wraps" role="group" aria-label="pot wrap">
            {WRAP_LIST.map((x) => <button key={x.id} className={`wrapchoice w-${x.id}`} aria-pressed={wrap === x.id} aria-label={x.label} data-tip={x.label} onClick={() => setWrap(x.id)} />)}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className={`flow${dir ? ` slide-${dir}` : ""}`}>
          <h1 className="giant q">you?</h1>
          <input className="bigin" placeholder="your name" autoFocus value={name} onChange={(e) => setName(fitBytes(e.target.value, MAX_NAME_BYTES))} onKeyDown={(e) => e.key === "Enter" && next()} aria-label="your name" enterKeyHint="go" autoComplete="given-name" />
          <p className="hint" style={{ margin: 0 }}>the pot is paid to you, to buy the gift. chip in your own share too if you&apos;re part of it.</p>
          {missingEnv.length > 0 && <div className="notice">setup needed: <code>{missingEnv.join(", ")}</code> in <code>.env.local</code></div>}
          <div className="err" role="alert">{err}</div>
        </section>
      )}

      {step === 5 && (
        <section className={`flow${dir ? ` slide-${dir}` : ""}`}>
          <h1 className="giant q">ready.</h1>
          <p className="hint" style={{ margin: 0 }}>send it to the group. you&apos;ll see everyone who chips in on the pot, and in your pots under your balance.</p>
          <div className="linkbox"><code>{link.replace(/^https?:\/\//, "")}</code><button className="btn sm" onClick={copy}><CopyIcon done={copied} />{copied ? "copied" : "copy"}</button></div>
          <div className="ready-acts">
            <button className="btn lg" onClick={share}><ShareIcon />share with the group</button>
            <a className="btn lg ghost" href={link}>open pot</a>
          </div>
          <HomeScreenTip />
        </section>
      )}

      {step < 5 && (
        <div className="shell flownav">
          {/* the dashes at the top show progress; screen readers get it in words */}
          <span className="sr-only">step {step + 1} of 5</span>
          <button className="btn lg" onClick={next} disabled={!valid || busy}>{nextLabel}</button>
        </div>
      )}
    </main>
  );
}
