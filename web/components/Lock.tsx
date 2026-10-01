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

// dynamic's sdk puts the server's own reason for a refusal in `cause`; show it next to the summary
const message = (e: unknown) => {
  if (!(e instanceof Error)) return "something went wrong";
  const why = (e.cause instanceof Error && e.cause.message) || "";
  const text = (e as { shortMessage?: string }).shortMessage ?? e.message;
  return (why && !text.includes(why) ? `${text} (${why})` : text).slice(0, 320);
};
const refused = (e: unknown) => {
  if (!(e instanceof Error)) return false;
  const x = e as Error & { code?: string; status?: number };
  return x.name === "UnauthorizedError" || x.code === "unauthorized_error" || x.status === 401 ||
    /unauthori[sz]ed|401|authorization header/i.test(`${x.message} ${x.cause instanceof Error ? x.cause.message : ""}`);
};
// the browser's own words for a cancelled face id or a passkey that already exists, in ours
const explain = (e: unknown) => {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled. nothing changed.";
  if (name === "InvalidStateError") return "this phone already has a passkey for pottle.";
  if (name === "NoWebAuthNSupportError") return "this browser can't make passkeys. try safari or chrome.";
  return message(e);
};

/** whether this account can add the lock, and its passkeys. shared by the card and the nudge in the nav */
export function useLock(address?: string) {
  const offered = useQuery({ queryKey: ["passkeysOffered"], queryFn: dyn.passkeysOffered, enabled: !!address, staleTime: Infinity, retry: false });
  const list = useQuery({ queryKey: ["passkeys", address], queryFn: dyn.passkeys, enabled: !!address && !!offered.data,
    retry: (n, e) => !refused(e) && n < 2 }); // a refused session won't get better by asking again
  return { offered, list, unlocked: !!offered.data && list.data?.length === 0 };
}

// "not now" on the nudge holds for a week
const LATER = "pottle:lock-later";
export const lockLater = () => { try { localStorage.setItem(LATER, String(Date.now())); } catch {} };
export const lockSnoozed = () => { try { return Date.now() - Number(localStorage.getItem(LATER) ?? 0) < 7 * 86_400_000; } catch { return false; } };

/** nudge: the amount they hold, when it's worth locking; the card then leads with it and offers "not now" */
export function Lock({ onRelogin, nudge, onLater }: { onRelogin: () => void; nudge?: string; onLater?: () => void }) {
  const w = useWallet();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [recover, setRecover] = useState(false);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  // adding a passkey: first an emailed code proves it's them, then a tap opens face id
  const [adding, setAdding] = useState<"" | "code" | "ready">("");
  const [check, setCheck] = useState<dyn.Verification | null>(null);
  const [emailCode, setEmailCode] = useState("");

  const { offered, list } = useLock(w.address);
  if (!offered.data) return null;
  // couldn't read their passkeys: say so, rather than quietly dropping the lock option
  if (list.error) {
    const why = message(list.error);
    return (
      <div className="lock">
        <b className="lock-title">lock with face id</b>
        {refused(list.error) ? <>
          {/* dynamic won't accept this sign-in for account changes. its own reason is shown, to fix it from */}
          <p className="hint lock-text">your sign-in needs refreshing before you can add a lock. it takes one email code.</p>
          <p className="hint lock-text lock-why">{why}</p>
          <div className="lock-acts"><button className="btn sm" onClick={onRelogin}>sign in again</button></div>
        </> : <>
          <p className="err lock-text" role="alert">couldn&apos;t check your passkeys: {why}</p>
          <div className="lock-acts"><button className="btn sm ghost" onClick={() => list.refetch()} disabled={list.isFetching}>try again</button></div>
        </>}
      </div>
    );
  }
  if (!list.data) return null;
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

  if (!locked && adding === "code") {
    return (
      <div className="lock">
        <b className="lock-title">is it you?</b>
        <p className="hint lock-text">we sent a 6-digit code to your email. it makes sure nobody else adds a lock to your wallet.</p>
        <form className="lock-acts" onSubmit={(e) => { e.preventDefault(); if (check && emailCode.length === 6) void run(async () => { await dyn.confirmCode(check, emailCode); setAdding("ready"); setEmailCode(""); }); }}>
          <input className="bigin lock-code" placeholder="6-digit code" value={emailCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="the 6-digit code"
            onChange={(e) => { setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }} />
          <button className="btn sm" disabled={busy || emailCode.length !== 6}>{busy ? "checking…" : "confirm"}</button>
        </form>
        <div className="lock-acts"><button className="linkbtn" disabled={busy} onClick={() => { setAdding(""); setEmailCode(""); setErr(""); }}>cancel</button></div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    );
  }

  if (!locked) {
    return (
      <div className={nudge ? "lock nudge" : "lock"}>
        <b className="lock-title">{nudge ? `you're holding ${nudge}. lock it?` : "lock with face id"}</b>
        <p className="hint lock-text">{adding === "ready"
          ? "confirmed. now tap below and use face id or your fingerprint to make the passkey."
          : "every payment will ask for face id or your fingerprint, so someone who gets into your email still can't move your money."}</p>
        <div className="lock-acts">
          {adding === "ready"
            ? <button className="btn sm" disabled={busy} onClick={() => run(async () => { setCodes(await dyn.addPasskey()); setAdding(""); })}>{busy ? "one sec…" : "add face id"}</button>
            : <button className="btn sm" disabled={busy} onClick={() => run(async () => {
                const v = await dyn.confirmForPasskey();
                // signed in within the last ten minutes: no code needed, face id opens in this same tap
                if (v) { setCheck(v); setAdding("code"); } else { setCodes(await dyn.addPasskey()); setAdding(""); }
              })}>{busy ? "one sec…" : "add a passkey"}</button>}
          {nudge && adding !== "ready" && <button className="linkbtn" disabled={busy} onClick={() => { lockLater(); onLater?.(); }}>not now</button>}
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
