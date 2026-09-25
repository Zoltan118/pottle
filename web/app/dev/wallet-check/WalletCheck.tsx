"use client";

import { useState } from "react";
import { recoverTypedDataAddress, type Hex } from "viem";
import { useWallet } from "@/app/providers";
import { chain, NETWORK } from "@/lib/config";
import { publicClient } from "@/lib/pot";

type Row = { step: string; ok: boolean | null; detail: string };

// a harmless typed message on this chain: not a token transfer, nothing anyone could submit
const typed = {
  domain: { name: "pottle wallet check", version: "1", chainId: chain.id },
  types: { Check: [{ name: "note", type: "string" }, { name: "at", type: "uint256" }] },
  primaryType: "Check" as const,
};

export function WalletCheck() {
  const w = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const add = (r: Row) => setRows((x) => [...x, r]);
  const msg = (e: unknown) => ((e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? String(e)).slice(0, 220);

  async function run() {
    setRows([]); setBusy(true);
    try {
      let c;
      try {
        c = await w.client();
        const id = await c.getChainId();
        add({ step: "1. switch to " + chain.name, ok: id === chain.id, detail: `wallet reports chain ${id}, expected ${chain.id}` });
      } catch (e) { add({ step: "1. switch to " + chain.name, ok: false, detail: msg(e) }); return; }

      try {
        const message = { note: "just checking", at: BigInt(Math.floor(Date.now() / 1000)) };
        const sig = await c.signTypedData({ account: c.account, ...typed, message });
        const back = await recoverTypedDataAddress({ ...typed, message, signature: sig as Hex });
        add({ step: `2. sign on chain ${chain.id}`, ok: back.toLowerCase() === c.account.address.toLowerCase(), detail: `signature recovers to ${back}` });
      } catch (e) { add({ step: `2. sign on chain ${chain.id}`, ok: false, detail: msg(e) }); }

      try {
        const bal = await publicClient.getBalance({ address: c.account.address });
        const hash = await c.sendTransaction({ account: c.account, chain, to: c.account.address, value: 0n });
        add({ step: "3. send a transaction", ok: true, detail: `sent ${hash} (balance was ${Number(bal) / 1e18} usdc)` });
      } catch (e) {
        const m = msg(e);
        const noMoney = /insufficient|funds|balance|gas required exceeds/i.test(m);
        add({ step: "3. send a transaction", ok: noMoney ? true : false, detail: noMoney ? `refused only for lack of usdc, so the provider allowed it: ${m}` : m });
      }
    } finally { setBusy(false); }
  }

  return (
    <main className="view"><section className="flow">
      <h1 className="giant q">check.</h1>
      <p className="hint" style={{ margin: 0 }}>network: <b>{NETWORK}</b> · chain {chain.id} · signed in: <b>{w.address ?? "no"}</b></p>
      {!w.address
        ? <button className="btn lg" onClick={w.signIn} disabled={!w.ready}>sign in</button>
        : <button className="btn lg" onClick={run} disabled={busy}>{busy ? "checking…" : "run the check"}</button>}
      <div id="results" style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.step} className="notice" style={{ borderColor: r.ok ? "var(--mint)" : "var(--ribbon)" }}>
            <b style={{ color: r.ok ? "var(--mint)" : "var(--ribbon-text)" }}>{r.ok ? "pass" : "fail"} · {r.step}</b><br />{r.detail}
          </div>
        ))}
      </div>
    </section></main>
  );
}
