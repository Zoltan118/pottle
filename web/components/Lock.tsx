"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import * as dyn from "@/lib/dynamicClient";

/*
 * the optional passkey, in the account sheet. once added, every payment asks for face id (or a
 * fingerprint, or the phone's pin) and dynamic's servers refuse to sign without it, so a hacked email
 * alone can't move the money. shown only when dynamic is set up for it (lib/dynamicClient.ts)
 */

const message = (e: unknown) =>
  e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong";
// the browser's own words for a cancelled face id or a passkey that already exists, in ours
const explain = (e: unknown) => {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled. nothing changed.";
  if (name === "InvalidStateError") return "this phone already has a passkey for pottle.";
  if (name === "NoWebAuthNSupportError") return "this browser can't make passkeys. try safari or chrome.";
  return message(e);
};

export function Lock() {
  const w = useWallet();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [recover, setRecover] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const offered = useQuery({ queryKey: ["passkeysOffered"], queryFn: dyn.passkeysOffered, enabled: !!w.address, staleTime: Infinity, retry: false });
  const list = useQuery({ queryKey: ["passkeys", w.address], queryFn: dyn.passkeys, enabled: !!w.address && !!offered.data });
  if (!offered.data || !list.data) return null;
  const locked = list.data.length > 0;

  async function run(f: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setErr("");
    try { await f(); await qc.invalidateQueries({ queryKey: ["passkeys", w.address] }); } catch (e) { setErr(explain(e)); } finally { setBusy(false); }
  }

  // recovery codes, shown once, straight after the passkey is added
  if (codes.length) {
    return (
      <div className="lock">
        <b className="lock-title">save these codes.</b>
        <p className="hint lock-text">if you lose this phone and your passkey with it, one code unlocks your wallet once. keep them somewhere other than your email.</p>
        <ol className="lock-codes">{codes.map((c) => <li key={c}>{c}</li>)}</ol>
        <div className="lock-acts">
          <button className="btn sm ghost" onClick={async () => { try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); } catch {} }}>{copied ? "copied" : "copy"}</button>
          <button className="btn sm" disabled={busy} onClick={() => run(async () => { await dyn.codesSaved(); setCodes([]); setCopied(false); })}>i&apos;ve saved them</button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    );
  }

  if (!locked) {
    return (
      <div className="lock">
        <b className="lock-title">lock with face id</b>
        <p className="hint lock-text">every payment will ask for face id or your fingerprint, so someone who gets into your email still can&apos;t move your money.</p>
        <div className="lock-acts">
          <button className="btn sm" disabled={busy} onClick={() => run(async () => setCodes(await dyn.addPasskey()))}>{busy ? "one sec…" : "add a passkey"}</button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="lock on">
      <b className="lock-title">locked with a passkey ✓</b>
      <p className="hint lock-text">payments ask for face id or your fingerprint.</p>
      {recover ? (
        <form className="lock-acts" onSubmit={(e) => { e.preventDefault(); void run(async () => { await dyn.redeemRecoveryCode(code); setRecover(false); setCode(""); }); }}>
          <input className="bigin lock-code" placeholder="recovery code" value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }}
            aria-label="recovery code" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <button className="btn sm" disabled={busy || !code.trim()}>unlock</button>
        </form>
      ) : (
        <div className="lock-acts">
          <button className="linkbtn" onClick={() => { setRecover(true); setErr(""); }}>lost it? use a recovery code</button>
          <button className="linkbtn" disabled={busy} onClick={() => run(async () => { for (const p of list.data!) await dyn.removePasskey(p.id); })}>remove</button>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
