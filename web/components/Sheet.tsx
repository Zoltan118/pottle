"use client";

import { useRef, type KeyboardEvent, type ReactNode, type TransitionEvent } from "react";
import { watchKeyboard } from "@/lib/keyboard";
import { useMountEffect } from "@/hooks/useMountEffect";
import { CloseIcon } from "./Icons";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * bottom sheet, a modal dialog. it has its own close button, moves focus in when it opens, keeps tab
 * inside, closes on escape, and gives focus back to whatever opened it. the page behind stops
 * scrolling while it is open (see `body:has(.sheet.on)` in the css)
 */
export function Sheet({ open, onClose, label, children, closeButton = true }: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  closeButton?: boolean; // off when the content already has its own close
}) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // the phone keyboard. android shrinks the page, so a bottom sheet rises with it; an iphone keeps the page
  // and covers its bottom, where the sheet and its pay button are. so the sheet follows the part of the
  // screen that is still visible: lifted above the keyboard, and never taller than the room left
  useMountEffect(() => {
    return watchKeyboard(ref.current);
  });

  // android's back button and the swipe-back gesture close the sheet, like an app, instead of leaving the
  // page: opening adds a history step (keeping next's own state in it, so its router stays calm) and back
  // takes it away again. closing any other way removes the step, so history stays as it was
  const pushed = useRef(false);
  useMountEffect(() => {
    const el = ref.current;
    // the slide starts. a native listener: react does not wire up onTransitionStart. open or closed is read
    // from the sheet itself, so this never sees a stale render's props
    const onStart = (e: Event) => {
      if (e.target !== el || (e as globalThis.TransitionEvent).propertyName !== "transform" || !el) return;
      if (el.classList.contains("on")) {
        opener.current = document.activeElement as HTMLElement | null; // remember who opened the sheet
        if (!pushed.current) { history.pushState({ ...(history.state ?? {}), pottleSheet: true }, "", location.href); pushed.current = true; }
      } else if (pushed.current) {
        pushed.current = false;
        if ((history.state as { pottleSheet?: boolean } | null)?.pottleSheet) history.back();
      }
    };
    el?.addEventListener("transitionstart", onStart);
    const onPop = () => {
      if (!pushed.current || !ref.current?.classList.contains("on")) return;
      pushed.current = false;
      // the same path as the escape key, so the page's own close logic runs
      ref.current.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    };
    addEventListener("popstate", onPop);
    return () => { el?.removeEventListener("transitionstart", onStart); removeEventListener("popstate", onPop); };
  });

  // the slide ends: focus in, or hand focus back
  function onTransitionEnd(e: TransitionEvent) {
    const el = ref.current;
    if (e.target !== el || !el) return;
    if (open) {
      if (el.contains(document.activeElement)) return;
      const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    } else if (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement)) {
      opener.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`sheet${open ? " on" : ""}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open}
        tabIndex={-1} onKeyDown={onKeyDown} onTransitionEnd={onTransitionEnd}>
        {closeButton && <button className="iconbtn sheet-x" onClick={onClose} aria-label="close"><CloseIcon /></button>}
        {children}
      </div>
    </>
  );
}
