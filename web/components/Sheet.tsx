"use client";

import { useRef, type KeyboardEvent, type ReactNode, type TransitionEvent } from "react";

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

  // the slide starts: remember who opened the sheet. the slide ends: focus in, or hand focus back
  function onTransitionStart(e: TransitionEvent) {
    if (e.target === ref.current && open) opener.current = document.activeElement as HTMLElement | null;
  }
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
        tabIndex={-1} onKeyDown={onKeyDown} onTransitionStart={onTransitionStart} onTransitionEnd={onTransitionEnd}>
        {closeButton && <button className="iconbtn sheet-x" onClick={onClose} aria-label="close">×</button>}
        {children}
      </div>
    </>
  );
}
