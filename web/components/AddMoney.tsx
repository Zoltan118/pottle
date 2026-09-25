"use client";

import { useRef, useState } from "react";
import { useWallet } from "@/app/providers";
import { NETWORK } from "@/lib/config";

// circle onramp kit, shown only when the widget url is configured. the session comes from our own
// /api/onramp/sessions, which checks the signed-in user owns the wallet the money goes to.
export const ONRAMP_ON = !!process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL;
const WIDGET = process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL || undefined;

export function AddMoney({ onDone }: { onDone: () => void }) {
  const w = useWallet();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ close: () => void } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "open" | "error">("idle");
  const [err, setErr] = useState("");

  async function open() {
    if (!w.address || !w.userId) return w.signIn();
    setState("loading"); setErr("");
    try {
      const { createOnrampKit, fetchOnrampSession } = await import("@circle-fin/onramp-kit");
      const session = await fetchOnrampSession({
        url: "/api/onramp/sessions",
        headers: { authorization: `Bearer ${w.token() ?? ""}` },
        body: { appUserId: w.userId, destinationAddress: w.address, destinationChain: NETWORK === "testnet" ? "ARC-TESTNET" : "ARC" },
      });
      widget.current = createOnrampKit({ widgetBaseUrl: WIDGET }).mountIframe({
        session,
        container: box.current!,
        onDepositSettled: () => onDone(),
      });
      setState("open");
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 120) : "could not open");
      setState("error");
    }
  }

  function close() {
    widget.current?.close();
    widget.current = null;
    setState("idle");
    onDone();
  }

  return (
    <>
      {state !== "open" && (
        <button className="btn lg wide" onClick={open} disabled={state === "loading"}>
          {state === "loading" ? "opening…" : "add money"}
        </button>
      )}
      {state === "error" && <p className="err" role="alert">{err}</p>}
      <div className="onramp" hidden={state !== "open"}>
        <div className="onramp-bar">
          <span className="state">add money</span>
          <button className="iconbtn" onClick={close} aria-label="close">×</button>
        </div>
        <div className="onramp-frame" ref={box} />
      </div>
    </>
  );
}
