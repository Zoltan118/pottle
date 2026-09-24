"use client";

import { useRef } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";

/**
 * one tooltip for the whole app. any element with data-tip gets it.
 * waits 380ms the first time, then opens instantly while you move between tips.
 * mouse hovers, touch taps, keyboard focus.
 */
export function Tips() {
  const ref = useRef<HTMLDivElement>(null);
  useMountEffect(() => {
    const tip = ref.current!;
    let tShow: number | undefined, warmT: number | undefined, warm = false, cur: Element | null = null;
    const place = (el: Element) => {
      const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      const x = Math.max(12, Math.min(r.left + r.width / 2 - tr.width / 2, innerWidth - tr.width - 12));
      let y = r.top - tr.height - 10; const below = y < 8; if (below) y = r.bottom + 10;
      tip.style.left = x + "px"; tip.style.top = y + "px";
      tip.style.setProperty("--o", `${r.left + r.width / 2 - x}px ${below ? "0" : "100%"}`);
    };
    const show = (el: Element, now = false) => {
      clearTimeout(tShow); clearTimeout(warmT);
      const run = () => { cur = el; tip.textContent = el.getAttribute("data-tip"); tip.classList.toggle("instant", warm); place(el); tip.classList.add("on"); warm = true; };
      if (now || warm) run(); else tShow = window.setTimeout(run, 380);
    };
    const hide = () => { clearTimeout(tShow); tip.classList.remove("on"); cur = null; warmT = window.setTimeout(() => (warm = false), 600); };
    const over = (e: PointerEvent) => { const el = (e.target as Element).closest?.("[data-tip]"); if (el && e.pointerType === "mouse") show(el); };
    const out = (e: PointerEvent) => { const el = (e.target as Element).closest?.("[data-tip]"); if (el && e.pointerType === "mouse" && !el.contains(e.relatedTarget as Node)) hide(); };
    const fin = (e: FocusEvent) => { const el = (e.target as Element).closest?.("[data-tip]"); if (el && (e.target as Element).matches(":focus-visible")) show(el, true); };
    const fout = (e: FocusEvent) => { if ((e.target as Element).closest?.("[data-tip]")) hide(); };
    const click = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (el && el.matches(".tipdot, .tipword, .face")) { if (cur === el) hide(); else show(el, true); }
      else if (cur) hide();
    };
    const scroll = () => cur && hide();
    document.addEventListener("pointerover", over); document.addEventListener("pointerout", out);
    document.addEventListener("focusin", fin); document.addEventListener("focusout", fout);
    document.addEventListener("click", click); addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("pointerover", over); document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", fin); document.removeEventListener("focusout", fout);
      document.removeEventListener("click", click); removeEventListener("scroll", scroll);
    };
  });
  return <div className="tip" ref={ref} role="tooltip" />;
}
