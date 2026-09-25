"use client";

import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { PotArt } from "./PotArt";

const GOAL = 200;
// two stories on a loop: the goal gets hit, then a pot misses and everyone is refunded
const HIT = [["ana", 20], ["mert", 50], ["lea", 10], ["sam", 20], ["kaan", 50], ["ece", 20], ["tom", 30]] as const;
const MISS = [["jonas", 20], ["ines", 50], ["ayla", 10]] as const;

type Coin = { id: number; label: string; dir: "in" | "out"; x: number };

/** the landing pot plays by itself: coins drop in with names, the total counts up, it's on, then a refund */
export function HeroPot() {
  const [level, setLevel] = useState(0);
  const [line, setLine] = useState("");
  const [tone, setTone] = useState<"" | "ok" | "back">("");
  const [coins, setCoins] = useState<Coin[]>([]);
  const count = useRef<HTMLSpanElement>(null);

  useMountEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let total = 0, n = 0, alive = true;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));
    // hold still while the tab is hidden, so the loop never races ahead
    const visible = async () => { while (alive && document.hidden) await wait(500); };

    function tick(to: number) {
      const from = total, start = performance.now(), el = count.current;
      total = to;
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / 420), v = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
        if (el) el.textContent = `$${v}`;
        if (k < 1 && alive) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      setLevel(to / GOAL);
    }
    function coin(label: string, dir: "in" | "out") {
      const id = ++n, x = 38 + Math.random() * 24;
      setCoins((c) => [...c, { id, label, dir, x }]);
      timers.push(window.setTimeout(() => setCoins((c) => c.filter((k) => k.id !== id)), 900));
    }

    if (reduce) {
      tick(140); setLine("7 friends in"); return () => { alive = false; };
    }

    (async () => {
      while (alive) {
        setTone(""); setLine("sarah's gift");
        for (const [who, amt] of HIT) {
          await visible(); if (!alive) return;
          coin(`${who} · $${amt}`, "in");
          await wait(380); tick(total + amt); setLine(`${who} is in`);
          await wait(620);
        }
        setTone("ok"); setLine("it's on. $200 to deniz.");
        await wait(2200); tick(0); setTone(""); await wait(700);

        setLine("trip to lisbon");
        for (const [who, amt] of MISS) {
          await visible(); if (!alive) return;
          coin(`${who} · $${amt}`, "in");
          await wait(380); tick(total + amt); setLine(`${who} is in`);
          await wait(620);
        }
        setLine("time's up."); await wait(1100);
        setTone("back"); setLine("everyone got it back.");
        for (const [who, amt] of [...MISS].reverse()) {
          coin(`$${amt} → ${who}`, "out");
          tick(total - amt);
          await wait(420);
        }
        await wait(1800);
      }
    })();

    return () => { alive = false; timers.forEach(clearTimeout); };
  });

  return (
    <div className="potstage" aria-label="a pot filling up with friends' money, then refunding everyone">
      <div className={`potbtn static herop ${tone}`} aria-hidden="true">
        {coins.map((c) => (
          <span key={c.id} className={`coin2 ${c.dir}`} style={{ left: `${c.x}%` }}>
            <i /><em>{c.label}</em>
          </span>
        ))}
        <PotArt level={level} />
      </div>
      <div className="count" aria-hidden="true"><span ref={count}>$0</span> <small>of ${GOAL}</small></div>
      <div className={`hint heroline ${tone}`} aria-hidden="true">{line}</div>
    </div>
  );
}
