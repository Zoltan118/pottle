"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import * as dyn from "@/lib/dynamicClient";

/*
 * face id sign-in, in the account sheet: add a passkey, see every passkey on the account, and recover
 * from a lost one with a recovery code. it signs the person in and guards adding or removing a key; it
 * does not guard payments (see lib/dynamicClient.ts). shown only when dynamic is set up for it
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

// the recovery codes on screen live outside the card, so nothing that redraws the card can wipe them
// before anyone saved them
// they belong to one account, so another account signing in on this tab never sees them
let shown: { owner?: string; codes: string[] } = { codes: [] };
const watchers = new Set<() => void>();
const NONE: string[] = [];
const show = (owner: string | undefined, codes: string[]) => { shown = { owner, codes }; watchers.forEach((w) => w()); };
const useShown = (owner?: string) => {
  const s = useSyncExternalStore((w) => { watchers.add(w); return () => { watchers.delete(w); }; }, () => shown, () => shown);
  return owner && s.owner === owner ? s.codes : NONE;
};

/** a passkey's device, in a few words, from what the browser said when it was made */
function device(ua = "") {
  const os = /iphone/i.test(ua) ? "iphone" : /ipad/i.test(ua) ? "ipad" : /android/i.test(ua) ? "android" : /mac os/i.test(ua) ? "mac" : /windows/i.test(ua) ? "windows" : /linux/i.test(ua) ? "linux" : "";
  const browser = /edg\//i.test(ua) ? "edge" : /crios|chrome/i.test(ua) ? "chrome" : /fxios|firefox/i.test(ua) ? "firefox" : /safari/i.test(ua) ? "safari" : "";
  return [os, browser].filter(Boolean).join(", ") || ua.slice(0, 40) || "a device";
}

/** whether face id sign-in is offered, and this account's passkeys. shared by the card and the nav row */
export function useLock(address?: string) {
  const offered = useQuery({ queryKey: ["passkeysOffered"], queryFn: dyn.passkeysOffered, enabled: !!address, staleTime: Infinity, retry: false });
  const list = useQuery({ queryKey: ["passkeys", address], queryFn: dyn.passkeys, enabled: !!address && !!offered.data,
    retry: (n, e) => !refused(e) && n < 2 }); // a refused session won't get better by asking again
  return { offered, list };
}

/** face id sign-in: add a passkey, see the ones on the account, recover from a lost one */
export function Lock({ onRelogin }: { onRelogin: () => void }) {
  const w = useWallet();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fresh = useShown(w.address);
  const [recover, setRecover] = useState(false);
  const [unlocked, setUnlocked] = useState(false); // a recovery code worked: say what it did
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  // adding a passkey: first an emailed code proves it's them, then a tap opens face id
  const [adding, setAdding] = useState<"" | "code" | "ready">("");
  const [check, setCheck] = useState<dyn.Verification | null>(null);
  const [emailCode, setEmailCode] = useState("");

  const { offered, list } = useLock(w.address);
  const codes = fresh;
  if (!offered.data) return null;
  // couldn't read their passkeys: say so, rather than quietly dropping the lock option
  if (list.error) {
    const why = message(list.error);
    return (
      <div className="lock">
        <b className="lock-title">face id sign-in</b>
        {refused(list.error) ? <>
          {/* dynamic won't accept this sign-in for account changes. its own reason is shown, to fix it from */}
          <p className="hint lock-text">your sign-in needs refreshing before you can add a passkey. it takes one email code.</p>
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
        <p className="hint lock-text">if you lose this phone and your passkey with it, one code lets you remove that passkey, so you can add one on your new phone. they&apos;re shown only now: save them somewhere other than your email before you close this.</p>
        <ol className="lock-codes">{codes.map((c) => <li key={c}>{c}</li>)}</ol>
        <div className="lock-acts">
          <button className="btn sm ghost" onClick={async () => { try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); } catch {} }}>{copied ? "copied" : "copy"}</button>
          <button className="btn sm" disabled={busy} onClick={() => run(async () => {
            show(w.address, []); setCopied(false);
          })}>i&apos;ve saved them</button>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    );
  }

  if (!locked && adding === "code") {
    return (
      <div className="lock">
        <b className="lock-title">is it you?</b>
        <p className="hint lock-text">we sent a 6-digit code to your email. it makes sure nobody else adds a passkey to your account.</p>
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
      <div className="lock">
        <b className="lock-title">face id sign-in</b>
        <p className="hint lock-text">{adding === "ready"
          ? "confirmed. now tap below and use face id or your fingerprint to make the passkey."
          : "sign in with face id or your fingerprint instead of an email code. adding or removing a key on your account asks for it too."}</p>
        <div className="lock-acts">
          {adding === "ready"
            ? <button className="btn sm" disabled={busy} onClick={() => run(async () => { show(w.address, await dyn.addPasskey()); setAdding(""); })}>{busy ? "one sec…" : "add face id"}</button>
            : <button className="btn sm" disabled={busy} onClick={() => run(async () => {
                const v = await dyn.confirmForPasskey();
                // signed in within the last ten minutes: no code needed, face id opens in this same tap
                if (v) { setCheck(v); setAdding("code"); } else { show(w.address, await dyn.addPasskey()); setAdding(""); }
              })}>{busy ? "one sec…" : "add a passkey"}</button>}
        </div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="lock on">
      <b className="lock-title">face id sign-in is on ✓</b>
      {/* every passkey on the account, so one nobody here added would stand out */}
      <ul className="lock-keys">
        {/* one remove per passkey and per tap: each removal needs its own proof, and face id only opens on a tap */}
        {list.data.map((k) => (
          <li key={k.id} className="lock-key">
            <span>{device(k.device)} · added {new Date(k.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
            <button className="linkbtn" disabled={busy} onClick={() => run(async () => { await dyn.removePasskey(k.id); setUnlocked(false); })}>remove</button>
          </li>
        ))}
      </ul>
      <p className="hint lock-text">{unlocked
        ? "recovery code accepted. remove the lost passkey below in the next few minutes, then add one on your new phone."
        : "your passkey signs you in, and adding or removing a key asks for it."}</p>
      {recover ? (<>
        <form className="lock-acts" onSubmit={(e) => { e.preventDefault(); void run(async () => { await dyn.redeemRecoveryCode(code); setRecover(false); setCode(""); setUnlocked(true); }); }}>
          <input className="bigin lock-code" placeholder="recovery code" value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }}
            aria-label="recovery code" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
          <button className="btn sm" disabled={busy || !code.trim()}>use code</button>
        </form>
        <div className="lock-acts"><button className="linkbtn" disabled={busy} onClick={() => { setRecover(false); setCode(""); setErr(""); }}>cancel</button></div>
      </>) : (
        <div className="lock-acts">
          <button className="linkbtn" onClick={() => { setRecover(true); setErr(""); }}>lost your passkey? use a recovery code</button>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
