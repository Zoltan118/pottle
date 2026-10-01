"use client";

import { useState } from "react";
import { useWallet } from "@/app/providers";
import * as dyn from "@/lib/dynamicClient";

/*
 * run this signed in with your EMAIL code (not face id), on an account that has a passkey. a safe lock
 * reads: step-up required with passkey only, recovery codes refused or none, every permission "not
 * granted" from email, and making new codes refused. anything in capitals is a hole
 */
export function LockCheck() {
  const w = useWallet();
  const [rows, setRows] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<dyn.Verification | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const run = async (f: () => Promise<Record<string, string> | void>) => {
    setBusy(true); setErr("");
    try { const r = await f(); if (r) setRows((x) => ({ ...x, ...r })); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  if (!w.address) return <main className="view"><section className="flow"><h1 className="giant q">lock check.</h1><p className="hint">sign in with your email code first, on an account with a passkey.</p><button className="btn lg" onClick={() => void w.signIn()}>sign in</button></section></main>;
  return (
    <main className="view">
      <section className="flow">
        <h1 className="giant q">lock check.</h1>
        <p className="hint" style={{ margin: 0 }}>signed in as {w.address.slice(0, 6)}…{w.address.slice(-4)}. use an email sign-in, not face id.</p>
        <button className="btn lg" disabled={busy} onClick={() => run(dyn.lockCheck.session)}>1. check this session</button>
        <button className="btn lg ghost" disabled={busy || !!v} onClick={() => run(async () => { setV(await dyn.lockCheck.sendEmail()); })}>2. email me a code</button>
        {v && (
          <form style={{ display: "flex", gap: 10 }} onSubmit={(e) => { e.preventDefault(); void run(() => dyn.lockCheck.emailScopes(v, code)); }}>
            <input className="bigin" placeholder="6-digit code" value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="the 6-digit code" />
            <button className="btn sm" disabled={busy || code.length !== 6}>check</button>
          </form>
        )}
        <button className="btn lg ghost" disabled={busy} onClick={() => { if (confirm("this tries to make new recovery codes. if it works, your old codes stop working. go on?")) void run(dyn.lockCheck.newCodes); }}>3. try making new recovery codes</button>
        {err && <p className="err" role="alert">{err}</p>}
        <dl style={{ display: "grid", gap: 8, margin: 0 }}>
          {Object.entries(rows).map(([k, val]) => (
            <div key={k} style={{ display: "grid", gap: 2 }}><dt className="hint" style={{ margin: 0 }}>{k}</dt><dd style={{ margin: 0, fontWeight: 800, color: /RETURNED|GRANTED|WORKED|NOT required/.test(val) ? "var(--ribbon-text)" : "var(--ink)" }}>{val}</dd></div>
          ))}
        </dl>
      </section>
    </main>
  );
}
