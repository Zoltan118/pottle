"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { CloseIcon, CopyIcon, ShareIcon } from "./Icons";

/*
 * receive, in the account sheet: the wallet address as a qr code and in groups of four, for a friend or
 * an exchange sending usdc or eurc to it. only on arc: the same address on another network is a
 * different place, and money sent there doesn't show up here
 */

export function Receive({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const w = useWallet();
  const [copied, setCopied] = useState(false);
  const addr = w.address ?? "";
  // the qr is drawn in the page's own ink and paper, so it reads in light and dark
  const qr = useQuery({
    queryKey: ["qr", addr],
    enabled: !!addr,
    staleTime: Infinity,
    queryFn: async () => (await import("qrcode")).toString(addr, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#0000" } }),
  });

  async function copy() {
    try { await navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ text: addr }); } catch {} return; }
    await copy();
  }

  return (
    <div className="cash">
      <div className="cash-head">
        <button className="linkbtn" onClick={onBack}>← your account</button>
        <button className="iconbtn" onClick={onClose} aria-label="close"><CloseIcon /></button>
      </div>
      <h2 className="giant cash-title">receive.</h2>
      <p className="cash-lead">send <b>usdc</b> or <b>eurc</b> on the <b>arc</b> network here.</p>
      <div className="recv-qr" role="img" aria-label="qr code of your wallet address"
        dangerouslySetInnerHTML={qr.data ? { __html: qr.data } : undefined} />
      {/* the address is the copy button: tap anywhere on it */}
      <button className="recv-addr" onClick={copy} aria-label={copied ? "address copied" : `copy your address, ${addr}`}>
        <code className="cash-addr">{addr.slice(2).match(/.{1,4}/g)?.map((g, i) => <span key={i}>{i === 0 ? `0x${g}` : g}</span>)}</code>
        <span className="recv-copy"><CopyIcon done={copied} />{copied ? "copied" : "copy address"}</span>
      </button>
      <button className="btn lg ghost wide" onClick={share}><ShareIcon />share</button>
      <p className="hint cash-warn">from an exchange, pick arc as the network when you withdraw. the same address on another network is a different place, and money sent there won&apos;t show up in pottle.</p>
    </div>
  );
}
