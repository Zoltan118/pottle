"use client";

import { useMountEffect } from "@/hooks/useMountEffect";
import { isStandalone } from "@/lib/install";

const AWAY = 30 * 60_000;

/**
 * a home-screen app has no reload button, and iphones resume it where it was left, sometimes days
 * later. coming back after half an hour away reloads it, so a new version is never missed. pot numbers
 * refresh on their own anyway; this is for the app itself. a pot being made is never interrupted
 */
export function StaleReload() {
  useMountEffect(() => {
    if (!isStandalone()) return;
    let hiddenAt = 0;
    const onChange = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > AWAY && !location.pathname.startsWith("/new")) location.reload();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  });
  return null;
}
