"use client";

import { useRef, useState } from "react";
import { verifyTypedData, type Address, type Hex } from "viem";
import { useMountEffect } from "@/hooks/useMountEffect";
import { chain, POTTLE, TOKEN } from "@/lib/config";

/*
 * the sign-in lab. everything the real flow would do on a phone, one step at a time, with a log:
 * email, the code (one field, iphone's code autofill, paid off on the sixth digit), the embedded
 * wallet, and one chip-in signature checked on the spot. the pending step is kept in this tab's
 * storage, so leaving for the mail app (and even a reload) comes back to the code step
 */

type Client = typeof import("@dynamic-labs-sdk/client");
type Verification = Awaited<ReturnType<Client["sendEmailOTP"]>>;
type Step = "email" | "code" | "wallet" | "done";
const KEY = "pottle:lab-signin";

let ready: Promise<Client> | null = null;
function load(environmentId: string): Promise<Client> {
  if (!ready) ready = (async () => {
    const c = await import("@dynamic-labs-sdk/client");
    const { addWaasEvmExtension } = await import("@dynamic-labs-sdk/evm/waas");
    const arc = {
      networkId: String(chain.id), chain: "EVM", name: chain.name, displayName: chain.name, testnet: true,
      rpcUrls: { http: [...chain.rpcUrls.default.http] }, blockExplorerUrls: [chain.blockExplorers?.default.url ?? ""],
      iconUrl: "", nativeCurrency: { decimals: chain.nativeCurrency.decimals, name: chain.nativeCurrency.name, symbol: chain.nativeCurrency.symbol },
    };
    c.createDynamicClient({
      environmentId, autoInitialize: false,
      metadata: { name: "pottle", universalLink: location.origin },
      // arc first, so a fresh embedded wallet starts on it, added even if the dashboard does not list it
      transformers: {
        networksData: (nets) => {
          const evm = nets.find((n) => n.networkId === arc.networkId) ?? (arc as unknown as (typeof nets)[number]);
          return [evm, ...nets.filter((n) => n.networkId !== arc.networkId)];
        },
      },
    });
    addWaasEvmExtension();
    await c.initializeClient();
    return c;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

function where() {
  const ua = navigator.userAgent;
  const app = /WhatsApp/i.test(ua) ? "whatsapp" : /Instagram/i.test(ua) ? "instagram" : /FBAN|FBAV/i.test(ua) ? "facebook"
    : /Telegram/i.test(ua) ? "telegram" : /Line\//i.test(ua) ? "line" : /GSA\//i.test(ua) ? "google app" : "browser";
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const os = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "desktop";
  return `${os} · ${standalone ? "home screen app" : app}`;
}

export function SigninLab({ environmentId }: { environmentId: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<Address | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [env, setEnv] = useState("");
  const [vv, setVv] = useState("");
  const verification = useRef<Verification | null>(null);
  const t0 = useRef(0);
  const note = (m: string) => setLog((l) => [...l, `${((performance.now() - t0.current) / 1000).toFixed(1)}s  ${m}`]);

  useMountEffect(() => {
    t0.current = performance.now();
    setEnv(where());
    note(`opened in ${where()}`);
    // does the keyboard cover the field? the visible height, live
    const vp = window.visualViewport;
    const onVp = () => vp && setVv(`${Math.round(vp.height)} of ${window.innerHeight}px visible`);
    onVp();
    vp?.addEventListener("resize", onVp);
    // back from the mail app (or after a reload): pick the pending step up again
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { email: string; verification: Verification } | null;
      if (saved) { verification.current = saved.verification; setEmail(saved.email); setStep("code"); note(`restored: code step for ${saved.email}`); }
    } catch { /* storage blocked: start from the email step */ }
    // a session from before comes back without any code
    load(environmentId).then(async (c) => {
      note("sdk ready");
      const acct = c.getWalletAccounts().find((a) => a.chain === "EVM");
      if (acct) { setAddress(acct.address as Address); setStep("done"); note(`already signed in: ${acct.address}`); }
    }).catch((e) => note(`sdk failed: ${e instanceof Error ? e.message : e}`));
    return () => vp?.removeEventListener("resize", onVp);
  });

  async function sendCode() {
    if (!/^\S+@\S+\.\S+$/.test(email)) return note("that doesn't look like an email");
    setBusy(true);
    try {
      const c = await load(environmentId);
      verification.current = await c.sendEmailOTP({ email });
      try { sessionStorage.setItem(KEY, JSON.stringify({ email, verification: verification.current })); } catch {}
      setStep("code");
      note(`code sent to ${email}`);
    } catch (e) {
      note(`send failed: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(false); }
  }

  async function verify(value: string) {
    if (!verification.current || busy) return;
    setBusy(true);
    try {
      const c = await load(environmentId);
      await c.verifyOTP({ otpVerification: verification.current, verificationToken: value });
      note("code accepted");
      try { sessionStorage.removeItem(KEY); } catch {}
      setStep("wallet");
      // the wallet is not made by signing in: ask for the chains that are missing one
      const w = await import("@dynamic-labs-sdk/client/waas");
      const missing = w.getChainsMissingWaasWalletAccounts();
      if (missing.length) { note(`creating the embedded wallet (${missing.join(", ")})`); await w.createWaasWalletAccounts({ chains: missing }); }
      const acct = c.getWalletAccounts().find((a) => a.chain === "EVM");
      if (!acct) throw new Error("no evm wallet after sign-in");
      setAddress(acct.address as Address);
      setStep("done");
      note(`signed in: ${acct.address}`);
    } catch (e) {
      setCode("");
      note(`verify failed: ${e instanceof Error ? e.message : e}`);
      setStep((s) => (s === "wallet" ? "code" : s));
    } finally { setBusy(false); }
  }

  // the real risk on phones: can the embedded wallet sign pottle's chip-in, here, in this browser?
  async function signChip() {
    if (!address) return;
    setBusy(true);
    try {
      const c = await load(environmentId);
      const { isEvmWalletAccount } = await import("@dynamic-labs-sdk/evm");
      const { createWalletClientForWalletAccount } = await import("@dynamic-labs-sdk/evm/viem");
      const account = c.getWalletAccounts().find(isEvmWalletAccount);
      if (!account) throw new Error("no evm wallet");
      const wc = await createWalletClientForWalletAccount({ walletAccount: account });
      note(`wallet client on chain ${wc.chain?.id} (arc testnet is ${chain.id})`);
      const message = {
        from: address, to: (POTTLE ?? address) as Address, value: 10_000n, validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 600), nonce: `0x${"ab".repeat(32)}` as Hex,
      };
      const typed = {
        domain: { name: TOKEN.usd.name, version: "2", chainId: chain.id, verifyingContract: TOKEN.usd.address },
        types: { ReceiveWithAuthorization: [
          { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        ] },
        primaryType: "ReceiveWithAuthorization" as const,
        message,
      };
      const started = performance.now();
      const signature = await wc.signTypedData({ account: wc.account!, ...typed });
      const ok = await verifyTypedData({ address, signature, ...typed });
      note(`${ok ? "PASS" : "FAIL"}: chip-in signature ${ok ? "checks out" : "does not match"} (${Math.round(performance.now() - started)}ms, not sent)`);
    } catch (e) {
      note(`sign failed: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(false); }
  }

  async function signOut() {
    const c = await load(environmentId);
    await c.logout();
    try { sessionStorage.removeItem(KEY); } catch {}
    setAddress(null); setCode(""); setStep("email");
    note("signed out");
  }

  return (
    <main className="lab">
      <h1>sign-in lab</h1>
      <p className="lab-env">{env} · {vv}</p>

      {step === "email" && (
        <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }}>
          <label htmlFor="lab-email">your email</label>
          <input id="lab-email" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" value={email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="you@example.com" />
          <button className="btn lg" disabled={busy}>{busy ? "sending…" : "send me a code"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); void verify(code); }}>
          <label htmlFor="lab-code">code sent to {email}</label>
          <input id="lab-code" type="text" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done" maxLength={6} value={code} placeholder="6-digit code"
            onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) void verify(v); }} />
          <button className="btn lg" disabled={busy || code.length !== 6}>{busy ? "checking…" : "sign in"}</button>
          <button type="button" className="btn sm ghost" onClick={() => { setStep("email"); setCode(""); }}>use another email</button>
        </form>
      )}

      {step === "wallet" && <p className="lab-note">setting up your wallet…</p>}

      {step === "done" && (
        <div className="lab-done">
          <p>signed in as <b>{address?.slice(0, 6)}…{address?.slice(-4)}</b></p>
          <button className="btn lg" onClick={signChip} disabled={busy}>{busy ? "signing…" : "sign a test chip-in"}</button>
          <button className="btn sm ghost" onClick={signOut}>sign out</button>
        </div>
      )}

      <ol className="lab-log" aria-live="polite">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      <button className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(`${env}\n${log.join("\n")}`).then(() => note("log copied"))}>copy the log</button>
    </main>
  );
}
