"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";

export type Counter = { to: (value: number) => void };

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * a number that rolls to its new value instead of jumping. the page tells it when the value changes
 * (through `counters`, the same way the pot page feeds coins to the pot), and it writes the digits
 * itself, so react never snaps it to the end halfway through
 */
export function CountUp({ value, format, counters, ms = 700 }: {
  value: number;
  format: (n: number) => string;
  counters: MutableRefObject<Set<Counter>>;
  ms?: number;
}) {
  const [first] = useState(value); // react renders the starting value once; after that this component owns the text
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useMountEffect(() => {
    let frame = 0;
    const api: Counter = {
      to(target) {
        cancelAnimationFrame(frame);
        const node = el.current;
        if (!node) return;
        const from = shown.current;
        if (reduced() || from === target) { shown.current = target; node.textContent = format(target); return; }
        const start = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - start) / ms), eased = 1 - (1 - k) ** 3;
          const n = k === 1 ? target : Math.round((from + (target - from) * eased) * 100) / 100;
          shown.current = n;
          node.textContent = format(n);
          if (k < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
    };
    counters.current.add(api);
    return () => { cancelAnimationFrame(frame); counters.current.delete(api); };
  });
  return <span ref={el}>{format(first)}</span>;
}
