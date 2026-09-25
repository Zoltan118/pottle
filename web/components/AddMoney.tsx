"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/app/providers";
import { TOKEN, type Currency } from "@/lib/config";

// circle onramp kit: buy usdc (or eurc) by card, apple pay or google pay, with circle's own id check,
// without leaving pottle. shown only when the widget url is configured.
const WIDGET = process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL?.trim() || undefined;
export const ONRAMP_ON = !!WIDGET;
const PRODUCTION = !WIDGET || new URL(WIDGET).origin === "https://onramp.arc.io";

// the production widget refuses to load inside another site, and on iphones an embedded widget can
// lose its storage during the id check. both open circle's screen as a popup; everything else embeds.
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

type Kit = Awaited<ReturnType<typeof loadKit>>;
async function loadKit() {
  const m = await import("@circle-fin/onramp-kit");
  return { kit: m.createOnrampKit({ widgetBaseUrl: WIDGET }), fetchOnrampSession: m.fetchOnrampSession };
}

type Envelope = { event?: string; code?: string };

/** plain words for what the widget just told us */
function describe(e: Envelope, cur: Currency): { text: string; done?: boolean; over?: boolean } | null {
  const t = TOKEN[cur].name.toLowerCase();
  switch (e.event) {
    case "DEPOSIT_SUBMITTED": return { text: `payment sent. your ${t} lands in a minute or two.` };
    case "DEPOSIT_SETTLED": return { text: `added. your ${t} is in your wallet.`, done: true, over: true };
    case "INITIALIZATION_ERROR": return { text: e.code === "INVALID_SESSION_TOKEN" ? "that took too long. tap add money again." : "couldn't open the payment screen. tap add money again.", over: true };
    case "DEPOSIT_NOT_COMPLETED":
      switch (e.code) {
        case "CANCELED_BY_CUSTOMER": return { text: "cancelled. nothing was charged.", over: true };
        case "CUSTOMER_REJECTED": return { text: "the id check didn't pass, so nothing was charged.", over: true };
        case "CUSTOMER_PENDING_REVIEW": return { text: "your id is still being reviewed. try again later.", over: true };
        case "NO_PAYMENT_OPTIONS": return { text: "no payment options in your country yet.", over: true };
        case "PAYMENT_PROVIDER_ERROR": return { text: "the payment failed. nothing was charged, try again.", over: true };
        case "SESSION_TIMEOUT": return { text: "that timed out. tap add money again.", over: true };
        default: return { text: "no money was added.", over: true };
      }
    default: return null;
  }
}

/**
 * the "add money" button. it prepares a one-time session as soon as it is on screen, so the tap can
 * open circle's popup instantly (browsers block popups opened after a wait).
 */
export function AddMoney({ currency = "usd", amount, label = "add money", active = true, onDone }: {
  currency?: Currency;
  amount?: number; // prefill the widget, e.g. what someone is short by
  label?: string;
  active?: boolean; // only prepare a session while the button is actually on screen
  onDone: () => void;
}) {
  const w = useWallet();
  const qc = useQueryClient();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<{ close: () => void } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [note, setNote] = useState("");

  const key = ["onramp", w.address, currency, amount ?? null];
  const prep = useQuery({
    queryKey: key,
    enabled: active && !!w.address && !!w.userId,
    staleTime: 4 * 60_000, // sessions are short-lived and single use; mint a new one well before expiry
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const { kit, fetchOnrampSession } = await loadKit();
      const session = await fetchOnrampSession({
        url: "/api/onramp/sessions",
        headers: { authorization: w.authHeader() },
        body: {
          appUserId: w.userId!,
          destinationAddress: w.address!,
          ...(amount ? { amount: amount.toFixed(2) } : {}),
          assets: { tokens: [TOKEN[currency].name], chains: ["arc"] },
        },
      });
      return { kit, session } as { kit: Kit["kit"]; session: typeof session };
    },
  });

  const spent = () => qc.removeQueries({ queryKey: key }); // a session works once; the next tap gets a fresh one

  const callbacks = {
    onAnyEvent: (e: Envelope) => {
      const d = describe(e, currency);
      if (!d) return;
      setNote(d.text);
      if (d.done) onDone();
      if (d.over) { close(); spent(); }
    },
    onSessionExpired: () => { close(); spent(); setNote("that timed out. tap add money again."); },
  };

  function close() {
    widget.current?.close();
    widget.current = null;
    setOverlay(false);
  }

  function embed(session: NonNullable<typeof prep.data>["session"], kit: Kit["kit"]) {
    setOverlay(true);
    // the overlay mounts on the next frame; the widget needs its container in the page
    requestAnimationFrame(() => {
      if (!box.current) return;
      widget.current = kit.mountIframe({ session, container: box.current, ...callbacks });
    });
  }

  // must stay synchronous up to openWindow, or the browser blocks the popup
  function open() {
    if (!w.address || !w.userId) return w.signIn();
    if (!prep.data) { setNote(prep.isError ? "couldn't reach circle. try again in a moment." : "getting ready…"); if (prep.isError) prep.refetch(); return; }
    setNote("");
    const { kit, session } = prep.data;
    if (PRODUCTION || isIOS()) {
      const result = kit.openWindow({ session, ...callbacks });
      if (result.status === "opened") { widget.current = result.widget; return; }
      if (result.reason === "popup_blocked") { setNote("your browser blocked the payment window. allow popups for pottle and tap again."); return; }
      if (PRODUCTION) { setNote("open pottle in your phone's browser (safari or chrome) to add money."); return; }
      embed(session, kit); // in-app browsers and home-screen apps can't open popups; embed instead in sandbox
      return;
    }
    embed(session, kit);
  }

  return (
    <>
      <button className="btn lg wide" onClick={open} disabled={!!w.address && prep.isLoading}>
        {w.address && prep.isLoading ? "getting ready…" : label}
      </button>
      <p className="hint addnote" role="status" aria-live="polite" hidden={!note}>{note}</p>
      <div className="onramp" hidden={!overlay}>
        <div className="onramp-bar">
          <span className="state">{label}</span>
          <button className="iconbtn" onClick={() => { close(); spent(); setNote("no money was added."); }} aria-label="close">×</button>
        </div>
        <div className="onramp-frame" ref={box} />
      </div>
    </>
  );
}
