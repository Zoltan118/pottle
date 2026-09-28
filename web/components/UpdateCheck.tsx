"use client";

import { useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";

const RUNNING = process.env.NEXT_PUBLIC_BUILD_ID ?? "local";
const EVERY = 5 * 60_000;

/** nothing on screen is in the middle of something: no sheet open, no pot being made, nobody typing */
function idle() {
  const typing = document.activeElement?.matches("input, textarea, [contenteditable]") ?? false;
  const signingIn = [...document.querySelectorAll("*")].some((el) => el.shadowRoot?.querySelector("[role=dialog], input"));
  return !document.querySelector(".sheet.on") && !location.pathname.startsWith("/new") && !typing && !signingIn;
}

/**
 * keeps an open pottle on the newest version. a home-screen app has no reload button and a phone can
 * keep it open for days, so it asks /api/version whenever it comes back to the screen, and every few
 * minutes while open. a newer version reloads straight in when nothing is in progress; otherwise a
 * small pill offers it, so a half-typed name or an open payment is never thrown away
 */
export function UpdateCheck() {
  const [ready, setReady] = useState(false);
  useMountEffect(() => {
    if (RUNNING === "local") return;
    let last = 0;
    const check = async () => {
      if (document.hidden || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v?: string };
        if (!v || v === "local" || v === RUNNING) return;
        if (idle()) location.reload(); else setReady(true);
      } catch {} // offline or a blip: try again next time
    };
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(check, EVERY);
    void check();
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(t); };
  });
  if (!ready) return null;
  return (
    <button className="update-pill" onClick={() => location.reload()}>
      new version · <b>tap to update</b>
    </button>
  );
}
