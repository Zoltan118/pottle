"use client";

import { useSyncExternalStore } from "react";

/**
 * add to home screen. iphones have no install prompt, so they get the steps; android chrome fires
 * `beforeinstallprompt`, which is kept here so a button can show the real prompt later. nothing is
 * offered once pottle already runs from the home screen, or after the person said "not now"
 */

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export type Install = { show: boolean; platform: "ios" | "android" | "other"; canPrompt: boolean; inApp: boolean };

const KEY = "pottle:home-screen-dismissed";
const HIDDEN: Install = { show: false, platform: "other", canPrompt: false, inApp: false };
let deferred: PromptEvent | null = null;
let state: Install = HIDDEN;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

function dismissed() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

// the browsers built into instagram, facebook, messenger, tiktok, snapchat, line, linkedin, and android's
// plain webview (what whatsapp and others use on some phones) cannot add to the home screen at all
const IN_APP = /instagram|fban|fbav|fb_iab|fbios|messenger|musical_ly|bytedancewebview|snapchat|line\/|linkedinapp|; wv\)/i;

function compute(): Install {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const platform = ios ? "ios" : /android/i.test(ua) ? "android" : "other";
  // desktops can install too, but pottle is a phone thing: only phones get the suggestion
  const show = !isStandalone() && !dismissed() && (platform !== "other" || !!deferred);
  return { show, platform, canPrompt: !!deferred, inApp: IN_APP.test(ua) };
}

if (typeof window !== "undefined") {
  state = compute();
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as PromptEvent; state = compute(); emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; state = { ...state, show: false }; emit(); });
}

export function useInstall() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => HIDDEN,
  );
}

/** android: show chrome's own install dialog. returns false when there is no prompt to show */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  await e.userChoice.catch(() => null);
  state = compute(); emit();
  return true;
}

export function dismissInstall() {
  try { localStorage.setItem(KEY, "1"); } catch {}
  state = { ...state, show: false }; emit();
}
