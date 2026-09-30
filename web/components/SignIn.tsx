"use client";

import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { walletStore } from "@/lib/walletStore";
import * as dyn from "@/lib/dynamicClient";

/*
 * sign in with an email, drawn by pottle: one field for the email, one for the code. the code field
 * lets iphones offer the code straight from mail, and it signs in on the sixth digit. the step in
 * progress is kept in this tab's storage, so going to the mail app and coming back (even after the
 * phone reloaded the page) lands on the code step again. used in the sign-in sheet and inside the
 * chip-in sheet
 */

const KEY = "pottle:signin-pending";
const TTL = 10 * 60_000; // a code is good for about ten minutes
const RESEND = 30; // seconds before "send a new code"

type Pending = { email: string; verification: dyn.Verification; at: number };
export function readPending(): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Pending | null;
    return p && Date.now() - p.at < TTL ? p : null;
  } catch { return null; }
}
const savePending = (p: Pending) => { try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
const clearPending = () => { try { sessionStorage.removeItem(KEY); } catch {} };

/** dynamic's errors, in words someone can act on */
function explain(e: unknown, step: "email" | "code") {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (/too many|rate|429/.test(m)) return "too many tries. wait a minute, then try again.";
  if (step === "code" && /expired/.test(m)) return "that code has expired. send a new one.";
  if (step === "code" && /invalid|incorrect|wrong|verification|otp/.test(m)) return "that code didn't work. check it, or send a new one.";
  if (step === "email" && /email|invalid/.test(m)) return "that email didn't work. check it and try again.";
  // only blame the connection when the phone really is offline; otherwise dynamic is busy or limiting us
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "no connection. check your signal and try again.";
  if (/network|fetch|failed to/.test(m)) return "couldn't reach sign-in. wait a minute, then try again.";
  return "something went wrong. try again.";
}

export function SignIn({ title = "sign in with your email" }: { title?: string }) {
  const [step, setStep] = useState<"email" | "code" | "wallet">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds until a new code can be sent
  const verification = useRef<dyn.Verification | null>(null);
  const checking = useRef(false); // iphone's code autofill and an Enter can land together: check the code once
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  useMountEffect(() => {
    // back from the mail app, or reloaded half way: carry on at the code step
    const p = readPending();
    if (p) { verification.current = p.verification; setEmail(p.email); setStep("code"); requestAnimationFrame(() => codeInput.current?.focus()); }
    // inside the chip-in sheet there is no sheet opening to move focus here, so the field takes it itself
    else requestAnimationFrame(() => emailInput.current?.focus());
    const t = window.setInterval(() => setWait((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  });

  async function send(to = email) {
    const e = to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr("that doesn't look like an email."); return; }
    setBusy(true); setErr("");
    try {
      verification.current = await dyn.sendCode(e);
      savePending({ email: e, verification: verification.current, at: Date.now() });
      setEmail(e); setCode(""); setStep("code"); setWait(RESEND);
      requestAnimationFrame(() => codeInput.current?.focus());
    } catch (x) {
      setErr(explain(x, "email"));
    } finally { setBusy(false); }
  }

  async function verify(value: string) {
    if (!verification.current || checking.current) return;
    checking.current = true;
    setBusy(true); setErr("");
    try {
      setStep("wallet");
      const s = await dyn.verifyCode(verification.current, value);
      if (!s) throw new Error("no wallet after sign-in");
      clearPending();
      walletStore.signedIn(s);
    } catch (x) {
      // only a real failure clears the code, and the field comes back ready for the next try
      setStep("code"); setCode(""); setErr(explain(x, "code"));
      requestAnimationFrame(() => codeInput.current?.focus());
    } finally { setBusy(false); checking.current = false; }
  }

  if (step === "wallet") {
    return <div className="signin"><p className="signin-title">signing you in…</p><p className="signin-sub">setting up your wallet. a second or two.</p></div>;
  }

  if (step === "code") {
    return (
      <form className="signin" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void verify(code); }}>
        <p className="signin-title">check your email</p>
        <p className="signin-sub">we sent a 6-digit code to <b>{email}</b>.</p>
        <input ref={codeInput} className="bigin signin-code" data-autofocus type="text" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done"
          maxLength={6} placeholder="6-digit code" aria-label="the 6-digit code" aria-invalid={!!err || undefined} value={code} disabled={busy}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); setErr(""); if (v.length === 6) void verify(v); }} />
        {err && <p className="signin-err" role="alert">{err}</p>}
        <button className="btn lg wide" disabled={busy || code.length !== 6}>{busy ? "checking…" : "sign in"}</button>
        <div className="signin-links">
          <button type="button" className="linkbtn" disabled={busy || wait > 0} onClick={() => void send()}>{wait > 0 ? `send a new code in ${wait}s` : "send a new code"}</button>
          <button type="button" className="linkbtn" disabled={busy} onClick={() => { clearPending(); verification.current = null; setStep("email"); setCode(""); setErr(""); }}>change email</button>
        </div>
      </form>
    );
  }

  return (
    <form className="signin" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <p className="signin-title">{title}</p>
      <p className="signin-sub">we&apos;ll send you a code. no password, and your wallet is made for you.</p>
      <input ref={emailInput} className="bigin" data-autofocus type="email" inputMode="email" autoComplete="email" enterKeyHint="send" autoCapitalize="none" spellCheck={false}
        placeholder="you@example.com" aria-label="your email" aria-invalid={!!err || undefined} value={email} disabled={busy}
        onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
      {err && <p className="signin-err" role="alert">{err}</p>}
      <button className="btn lg wide" disabled={busy}>{busy ? "sending…" : "send me a code"}</button>
    </form>
  );
}
