"use client";

import { useRef, useState } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";
import { useMountEffect } from "@/hooks/useMountEffect";
import { CIRCLE_APP_ID as BUILT_IN_APP_ID } from "@/lib/config";
import { walletStore } from "@/lib/walletStore";
import { Sheet } from "./Sheet";

// circle user-controlled wallets with email codes. the person types their email here, circle emails a
// code and checks it in its own screen, and the first time circle makes them a wallet on arc. every
// signature and every transaction is approved by them in circle's screen; pottle never holds a key.

type Session = { userToken: string; encryptionKey: string; walletId: string; address: Address; userId: string; at: number };
const KEY = "pottle.circle";
const TTL = 55 * 60_000; // circle user tokens last about an hour; ask again a little before that

function load(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && Date.now() - s.at < TTL ? s : null;
  } catch { return null; }
}
function save(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch {}
}

async function api<T>(body: object): Promise<T> {
  const r = await fetch("/api/circle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || "circle error"), { code: j.code, status: r.status });
  return j as T;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** eip-712 typed data as circle wants it: a json string with the domain type spelled out and bigints as strings */
function typedDataJson(a: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) {
  const order: [string, string][] = [["name", "string"], ["version", "string"], ["chainId", "uint256"], ["verifyingContract", "address"], ["salt", "bytes32"]];
  const EIP712Domain = order.filter(([k]) => a.domain[k] !== undefined).map(([name, type]) => ({ name, type }));
  return JSON.stringify({ types: { EIP712Domain, ...a.types }, domain: a.domain, primaryType: a.primaryType, message: a.message }, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

export default function CircleHost() {
  const sdkRef = useRef<W3SSdk | null>(null);
  const appIdRef = useRef<string | undefined>(BUILT_IN_APP_ID);
  const sessionRef = useRef<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "sending" | "code" | "wallet">("email");
  const [err, setErr] = useState("");

  /** run a circle challenge (the user approves in circle's screen) and resolve with its result */
  function approve<T = unknown>(challengeId: string): Promise<T> {
    const s = sessionRef.current, sdk = sdkRef.current;
    if (!s || !sdk) return Promise.reject(new Error("sign in first"));
    sdk.setAuthentication({ userToken: s.userToken, encryptionKey: s.encryptionKey });
    return new Promise((resolve, reject) => sdk.execute(challengeId, (e, res) => (e ? reject(new Error(e.message || "not approved")) : resolve(res as T))));
  }

  function publish(s: Session | null) {
    sessionRef.current = s;
    save(s);
    walletStore.set({
      on: true,
      ready: true,
      address: s?.address,
      userId: s?.userId,
      signIn: () => { setErr(""); setStep("email"); setOpen(true); },
      signOut: () => publish(null),
      authHeader: () => (sessionRef.current ? `Circle ${sessionRef.current.userToken}` : ""),
      client: async () => {
        const cur = sessionRef.current;
        if (!cur || Date.now() - cur.at > TTL) { publish(null); throw new Error("signed out, sign in again"); }
        // the slice of a viem wallet client that pottle uses, backed by circle challenges
        const adapter = {
          account: { address: cur.address, type: "json-rpc" as const },
          async signTypedData(a: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }): Promise<Hex> {
            const { challengeId } = await withSession(() => api<{ challengeId: string }>({ action: "sign", userToken: cur.userToken, walletId: cur.walletId, data: typedDataJson(a) }));
            const res = await approve<{ data?: { signature?: string } }>(challengeId);
            const sig = res?.data?.signature;
            if (!sig) throw new Error("no signature came back");
            return sig as Hex;
          },
          async writeContract(a: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
            const callData = encodeFunctionData({ abi: a.abi, functionName: a.functionName, args: a.args ?? [] } as Parameters<typeof encodeFunctionData>[0]);
            const since = Date.now();
            const { challengeId } = await withSession(() => api<{ challengeId: string }>({ action: "exec", userToken: cur.userToken, walletId: cur.walletId, contractAddress: a.address, callData }));
            await approve(challengeId);
            // circle submits the transaction; wait until it has a hash
            for (let i = 0; i < 60; i++) {
              const t = await api<{ state?: string; txHash?: string; errorReason?: string; none?: boolean }>({ action: "lastTx", userToken: cur.userToken, walletId: cur.walletId, since });
              if (t.state === "FAILED" || t.state === "DENIED" || t.state === "CANCELLED") throw new Error(t.errorReason || "transaction failed");
              if (t.txHash) return t.txHash as Hex;
              await sleep(1500);
            }
            throw new Error("the transaction is taking long. check back in a minute.");
          },
        };
        return adapter as unknown as Awaited<ReturnType<Parameters<typeof walletStore.set>[0]["client"]>>;
      },
    });
  }

  /** a 401 from circle means the user token expired: sign out and ask again */
  async function withSession<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (e) { if ((e as { status?: number }).status === 401) { publish(null); setOpen(true); } throw e; }
  }

  async function finishLogin(userToken: string, encryptionKey: string) {
    setStep("wallet");
    try {
      const sdk = sdkRef.current!;
      sdk.setAuthentication({ userToken, encryptionKey });
      const init = await api<{ challengeId?: string; existing?: boolean }>({ action: "init", userToken });
      if (init.challengeId) {
        // first sign-in: circle creates the wallet once the user approves
        await new Promise<void>((res, rej) => sdk.execute(init.challengeId!, (e) => (e ? rej(new Error(e.message || "wallet not created")) : res())));
      }
      let w: { walletId?: string; address?: Address; userId?: string; none?: boolean } = { none: true };
      for (let i = 0; i < 20 && !w.walletId; i++) { w = await api({ action: "wallet", userToken }); if (!w.walletId) await sleep(1000); }
      if (!w.walletId || !w.address) throw new Error("wallet not ready yet, try again");
      publish({ userToken, encryptionKey, walletId: w.walletId, address: w.address, userId: w.userId ?? "", at: Date.now() });
      setOpen(false);
      setStep("email");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "sign-in failed");
      setStep("email");
    }
  }

  useMountEffect(() => {
    let alive = true;
    (async () => {
      // the app id is public; it can be baked in at build time or served by our api
      if (!appIdRef.current) {
        try { appIdRef.current = (await api<{ appId: string }>({ action: "config" })).appId; }
        catch (e) { console.warn("[pottle] circle sign-in off:", e instanceof Error ? e.message : e); return; }
      }
      if (!alive) return;
      const sdk = new W3SSdk({ appSettings: { appId: appIdRef.current! } }, (e, res) => {
        if (e || !res || !("userToken" in res)) { setErr(e?.message || "that code didn't work"); setStep("email"); return; }
        void finishLogin(res.userToken, res.encryptionKey);
      });
      sdkRef.current = sdk;
      publish(load());
    })();
    return () => { alive = false; };
  });

  async function sendCode() {
    const sdk = sdkRef.current;
    if (!sdk) return;
    setErr(""); setStep("sending");
    try {
      const deviceId = await sdk.getDeviceId();
      const t = await api<{ deviceToken: string; deviceEncryptionKey: string; otpToken: string }>({ action: "otp", deviceId, email });
      sdk.updateConfigs({ appSettings: { appId: appIdRef.current! }, loginConfigs: { deviceToken: t.deviceToken, deviceEncryptionKey: t.deviceEncryptionKey, otpToken: t.otpToken } });
      setStep("code");
      sdk.verifyOtp(); // circle's own screen asks for the code
    } catch (e) {
      setErr(e instanceof Error ? e.message : "couldn't send the code");
      setStep("email");
    }
  }

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="sign in">
      <h2 className="giant">{step === "wallet" ? "almost." : "sign in."}</h2>
      {step === "wallet" ? (
        <p className="hint" style={{ margin: 0 }}>setting up your wallet…</p>
      ) : (
        <>
          <input className="bigin" type="email" inputMode="email" autoComplete="email" placeholder="your email" value={email}
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCode()} aria-label="your email" enterKeyHint="send" />
          <button className="btn lg wide" onClick={sendCode} disabled={!email.includes("@") || step === "sending"}>
            {step === "sending" ? "sending…" : step === "code" ? "send a new code" : "email me a code"}
          </button>
          <p className="hint" style={{ margin: 0 }}>{step === "code" ? "check your inbox and enter the code." : "no password. we'll email you a code."}</p>
        </>
      )}
      <div className="err" role="alert">{err}</div>
    </Sheet>
  );
}
