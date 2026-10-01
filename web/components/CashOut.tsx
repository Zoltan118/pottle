"use client";

import { useRef, useState } from "react";
import { isAddress, type Address, type Hex } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { BASE_GAS_CENTS, baseDelivery, baseFee, balanceCents, sendOut, sendViaBase, unsendable } from "@/lib/wallet";
import { BASE_NAME, baseExplorerTx, explorerTx, NETWORK, TOKEN, type Currency } from "@/lib/config";
import { money } from "@/lib/pot";
import { readyToSign } from "@/lib/dynamicClient";
import { CloseIcon } from "./Icons";

/*
 * cash out, inside the account sheet. to an exchange or wallet on arc (kraken, binance, kucoin), or on
 * base (coinbase and most wallets) through circle's cctp. straight to a bank account, with no exchange,
 * needs an off-ramp and is marked as coming
 */

type Step = "pick" | "exchange" | "review" | "sent";
type Net = "arc" | "base";
// where the money goes, and the network each one takes usdc on. arc is the network pottle runs on; base
// is another network, the one coinbase takes usdc on. a network is only the road, not a place to cash out
type Ex = "kraken" | "binance" | "kucoin" | "coinbase" | "other";
const EXCHANGES: { id: Ex; label: string }[] = [
  { id: "kraken", label: "kraken" }, { id: "binance", label: "binance" }, { id: "kucoin", label: "kucoin" },
  { id: "coinbase", label: "coinbase" }, { id: "other", label: "another" },
];
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const message = (e: unknown) =>
  e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message).slice(0, 140) : "something went wrong";

export function CashOut({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const w = useWallet();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("pick");
  const [ex, setEx] = useState<Ex | null>(null);
  const [otherNet, setOtherNet] = useState<Net>("arc"); // "another exchange or wallet": they tell us its network
  const net: Net = ex === "coinbase" ? "base" : ex === "other" ? otherNet : "arc";
  const where = ex && ex !== "other" ? ex : "your exchange";
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [picked, setPicked] = useState<Currency | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<Hex | "">("");
  const sending = useRef(false); // one tap, one send

  const usd = useQuery({ queryKey: ["cents", "usd", w.address], queryFn: () => balanceCents(w.address!, "usd"), enabled: !!w.address });
  const eur = useQuery({ queryKey: ["cents", "eur", w.address], queryFn: () => balanceCents(w.address!, "eur"), enabled: !!w.address });
  // base only takes usdc. on arc: the currency they hold, euros only when that is all there is, unless they pick
  const currency: Currency = net === "base" ? "usd" : picked ?? (!usd.data && eur.data ? "eur" : "usd");
  const held = (currency === "usd" ? usd.data : eur.data) ?? 0;
  // through base the wallet pays two tiny arc fees itself, so "all" leaves a couple of cents for them
  const spendable = net === "base" ? Math.max(0, held - BASE_GAS_CENTS) : held;
  const both = !!usd.data && !!eur.data;
  const token = TOKEN[currency].name.toLowerCase();
  const m = (cents: number) => money(cents / 100, currency);

  const cents = Math.round(Number(amount) * 100);
  const fee = useQuery({
    queryKey: ["basefee"], queryFn: () => baseFee(0n), enabled: net === "base" && step !== "pick", refetchInterval: 60_000, retry: 1,
  });
  // circle's fee in whole cents, rounded up, so "arrives" never promises more than lands
  const feeCents = fee.data !== undefined ? Number((fee.data + 9_999n) / 10_000n) : undefined;
  const arrives = net === "base" && feeCents !== undefined ? cents - feeCents : cents;

  const addr = to.trim();
  const addrErr = !addr ? "" : !isAddress(addr) ? "that isn't an address. it starts with 0x and has 42 characters." : w.address ? unsendable(addr, w.address) : "";
  const amountErr = !amount ? "" : !(cents > 0) ? "how much?" : cents > spendable ? `you can send ${m(spendable)}.`
    : net === "base" && feeCents !== undefined && arrives < 100 ? `circle's fee is about ${m(feeCents)}, so send at least ${m(feeCents + 100)}.` : "";
  const ready = !!ex && !!addr && !addrErr && cents > 0 && !amountErr && (net === "arc" || feeCents !== undefined);

  // through base: ask circle every few seconds until the usdc has been minted there
  const delivery = useQuery({
    queryKey: ["delivery", hash], queryFn: () => baseDelivery(hash as Hex), enabled: step === "sent" && net === "base" && !!hash,
    refetchInterval: (q) => (q.state.data?.done || q.state.error ? false : 4000), retry: 3,
  });

  async function paste() {
    try { const t = (await navigator.clipboard.readText()).trim(); if (t) { setTo(t); setErr(""); } } catch {}
  }

  async function send() {
    if (sending.current || !ready || !w.address) return;
    sending.current = true;
    setBusy(true); setErr("");
    try {
      await readyToSign(); // a wallet locked with a passkey asks for face id now, while the tap still counts
      const c = await w.client();
      // the fee is read again right before the burn, so a quote from a minute ago can't be too low
      setHash(net === "base"
        ? await sendViaBase(c, { to: addr as Address, cents, maxFee: await baseFee(BigInt(cents) * 10_000n) })
        : await sendOut(c, { to: addr as Address, cents, currency }));
      setStep("sent");
      qc.invalidateQueries({ queryKey: ["cents"] });
      qc.invalidateQueries({ queryKey: [currency === "eur" ? "eur" : "bal", w.address] });
    } catch (e) { setErr(message(e)); } finally { setBusy(false); sending.current = false; }
  }

  const head = (back?: { label: string; to: () => void }) => (
    <div className="cash-head">
      {back ? <button className="linkbtn" onClick={back.to} disabled={busy}>← {back.label}</button> : <span />}
      <button className="iconbtn" onClick={onClose} aria-label="close"><CloseIcon /></button>
    </div>
  );

  if (step === "sent") {
    const landed = net === "arc" || delivery.data?.done;
    return (
      <div className="cash">
        {head()}
        <h2 className="giant cash-title">{landed ? "sent." : "on its way."}</h2>
        {net === "arc"
          ? <p className="cash-lead"><b>{m(cents)}</b> {token} is on its way to {where} (<b>{short(addr)}</b>). it usually shows there within a few minutes. then sell it and withdraw to your bank.</p>
          : landed
            ? <p className="cash-lead"><b>{m(arrives)}</b> usdc arrived at {where} (<b>{short(addr)}</b>). it usually shows there within a few minutes. then sell it and withdraw to your bank.</p>
            : <p className="cash-lead">circle is moving <b>{m(cents)}</b> usdc from arc to {BASE_NAME}, the network {ex === "coinbase" ? "coinbase" : "that address"} uses. usually under a minute. you can close this, it carries on.</p>}
        {delivery.error && <p className="err" role="alert">{message(delivery.error)}</p>}
        <a className="cash-link" href={net === "base" && delivery.data?.tx ? baseExplorerTx(delivery.data.tx) : explorerTx(hash)} target="_blank" rel="noreferrer">
          {net === "base" && delivery.data?.tx ? "see the transfer on base ↗" : "see the transfer on arc ↗"}
        </a>
        <button className="btn lg wide" onClick={onBack}>done</button>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="cash">
        {head({ label: "change it", to: () => { setStep("exchange"); setErr(""); } })}
        <h2 className="giant cash-title">check it.</h2>
        <p className="cash-lead">send <b>{m(cents)}</b> {token} to {ex === "other" ? "this address" : <>your <b>{where}</b> account</>}, on the <b>{net === "base" ? BASE_NAME : "arc"}</b> network:</p>
        {/* the whole address, in groups of four, so it can be checked against the exchange screen */}
        <code className="cash-addr" aria-label={addr}>{addr.slice(2).match(/.{1,4}/g)!.map((g, i) => <span key={i}>{i === 0 ? `0x${g}` : g}</span>)}</code>
        {net === "base" && feeCents !== undefined && <p className="cash-lead">circle&apos;s fee for moving it to base is about <b>{m(feeCents)}</b>, so about <b>{m(arrives)}</b> reaches {where}.</p>}
        <p className="hint cash-warn">a payment on the blockchain can&apos;t be undone. the first and last few characters should match {where}.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="sheet-paybar">
          <button className="btn lg wide sheet-pay" onClick={send} disabled={busy}>{busy ? "sending…" : `send ${m(cents)}`}</button>
        </div>
      </div>
    );
  }

  if (step === "exchange") {
    return (
      <div className="cash">
        {head({ label: "cash out", to: () => { setStep("pick"); setErr(""); } })}
        <h2 className="giant cash-title">to your exchange.</h2>
        <div className="cash-q">
          <span className="label">which one?</span>
          <div className="cur cash-exes" role="group" aria-label="exchange">
            {EXCHANGES.map((e) => (
              <button key={e.id} className="chip" aria-pressed={ex === e.id} onClick={() => { setEx(e.id); setAmount(""); setErr(""); }}>{e.label}</button>
            ))}
          </div>
        </div>
        {!ex ? null : <>
        {ex === "coinbase" && <p className="hint cash-warn">coinbase doesn&apos;t take usdc on arc (the network pottle runs on) yet. it takes it on <b>base</b>, another network, so pottle moves it there through circle first, for about {feeCents !== undefined ? m(feeCents) : "6¢"}.</p>}
        {ex === "other" && (
          <div className="cash-q">
            <span className="label">which network does its deposit screen list for usdc?</span>
            <div className="cur" role="group" aria-label="network">
              {(["arc", "base"] as const).map((n) => (
                <button key={n} className="chip" aria-pressed={otherNet === n} onClick={() => { setOtherNet(n); setAmount(""); setErr(""); }}>{n}</button>
              ))}
            </div>
            <p className="hint cash-warn">a network is the road the money travels on, not a place to cash out. if it lists neither, it can&apos;t take money from pottle yet.</p>
          </div>
        )}
        {ex !== "coinbase" && ex !== "other" && <p className="hint cash-warn">{ex} takes {token} on <b>arc</b>, the network pottle runs on, so it goes straight there. pottle pays the fee.</p>}
        <ol className="cash-steps">
          <li>in {where}, open <b>{ex === "coinbase" ? "receive" : "deposit"}</b>, pick <b>{token}</b>, and choose the <b>{net}</b> network.</li>
          <li>copy the address it shows and paste it here.</li>
        </ol>
        <div className="cash-field">
          <input className="bigin cash-to" placeholder="0x…" value={to} onChange={(e) => { setTo(e.target.value); setErr(""); }}
            aria-label={`deposit address on ${net}`} aria-invalid={!!addrErr || undefined} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" />
          <button className="btn sm ghost" type="button" onClick={paste}>paste</button>
        </div>
        {addrErr && <p className="err" role="alert">{addrErr}</p>}
        {both && net === "arc" && (
          <div className="cur" role="group" aria-label="currency">
            {(["usd", "eur"] as const).map((c) => (
              <button key={c} className="chip" aria-pressed={currency === c} onClick={() => { setPicked(c); setAmount(""); }}>{TOKEN[c].name.toLowerCase()}</button>
            ))}
          </div>
        )}
        <div className="cash-field">
          <label className="money"><span>{TOKEN[currency].symbol}</span>
            <input className="bigin" inputMode="decimal" placeholder="0" value={amount} aria-label={`amount in ${token}`} aria-invalid={!!amountErr || undefined}
              onChange={(e) => { const v = e.target.value.replace(",", "."); if (/^\d{0,6}(\.\d{0,2})?$/.test(v)) { setAmount(v); setErr(""); } }} enterKeyHint="done" />
          </label>
          <button className="btn sm ghost" type="button" onClick={() => setAmount((spendable / 100).toFixed(2))} disabled={!spendable}>all {m(spendable)}</button>
        </div>
        {amountErr && <p className="err" role="alert">{amountErr}</p>}
        {net === "base" && fee.error && <p className="err" role="alert">{message(fee.error)}</p>}
        {net === "base" && feeCents !== undefined && cents > feeCents && !amountErr && <p className="hint cash-warn">circle&apos;s fee is about {m(feeCents)}, so about <b>{m(arrives)}</b> arrives.</p>}
        {net === "base" && !!eur.data && <p className="hint cash-warn">only usdc goes out this way. euros go to kraken, binance or kucoin, on arc.</p>}
        <p className="hint cash-warn">the address must be for the {net} network. one for another network can lose the money. first time? send a small amount and check it arrives.</p>
        </>}
        <div className="sheet-paybar">
          <button className="btn lg wide sheet-pay" onClick={() => setStep("review")} disabled={!ready}>review</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cash">
      {head({ label: "your account", to: onBack })}
      <h2 className="giant cash-title">cash out.</h2>
      <p className="cash-lead">you have <b>{money((usd.data ?? 0) / 100, "usd")}</b>{eur.data ? <> and <b>{money(eur.data / 100, "eur")}</b></> : null} in your pottle wallet.</p>
      <button className="cash-way" onClick={() => setStep("exchange")}>
        <b>to your exchange</b>
        <span>kraken, binance, kucoin or coinbase. sell it there and withdraw to your bank.</span>
      </button>
      <div className="cash-way soon" aria-disabled="true">
        <b>to your bank <em>soon</em></b>
        <span>straight to your bank account, no exchange account needed.</span>
      </div>
      {NETWORK === "testnet" && <p className="hint cash-warn">testnet: test usdc has no value and no exchange takes it. send it to any test wallet to try this.</p>}
    </div>
  );
}
