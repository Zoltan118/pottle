"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { usd, type Person, type Status } from "@/lib/pot";
import { PotArt } from "./PotArt";

export type PotFeed = {
  /** someone chipped in while the page was open */
  drop: (label: string, level: number) => void;
  /** the goal was just hit */
  celebrate: () => void;
  /** refunds went out */
  refund: (level: number) => void;
};

type Coin = { id: number; label?: string; kind: "in" | "out" | "burst"; x: number; delay: number };

/**
 * the pot page's pot. it replays the real history on open (each friend's coin with their name),
 * then reacts live to new chip-ins pushed through `feedRef`. the numbers on the page never animate
 * away from the truth; only the pot does.
 */
export function PotLive({ people, goal, level, status, feedRef }: {
  people: Person[];
  goal: number;
  level: number;
  status: Status;
  feedRef: MutableRefObject<PotFeed | null>;
}) {
  const [fill, setFill] = useState(level);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [glow, setGlow] = useState(status === "reached" || status === "released");
  const seqRef = useRef(0);

  useMountEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms));
    const add = (c: Omit<Coin, "id">, life = 900) => {
      const id = ++seqRef.current;
      setCoins((all) => [...all, { ...c, id }]);
      later(life + c.delay, () => setCoins((all) => all.filter((k) => k.id !== id)));
    };
    const x = () => 38 + Math.random() * 24;

    const api: PotFeed = {
      drop(label, to) {
        add({ label, kind: "in", x: x(), delay: 0 });
        later(380, () => setFill(to));
      },
      celebrate() {
        setGlow(true);
        for (let i = 0; i < 7; i++) add({ kind: "burst", x: 20 + i * 10, delay: i * 45 }, 1100);
      },
      refund(to) {
        setGlow(false);
        for (let i = 0; i < 3; i++) add({ kind: "out", x: x(), delay: i * 160 });
        later(200, () => setFill(to));
      },
    };
    feedRef.current = api;

    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // replay the history: the first eight friends drop in by name, anyone after that pours in at the end
      setFill(0);
      let sum = 0;
      people.slice(0, 8).forEach((p, i) => {
        sum += p.amount;
        const to = sum / goal;
        later(250 + i * 420, () => api.drop(`${p.name} · ${usd(p.amount)}`, to));
      });
      const replayEnd = 250 + Math.min(people.length, 8) * 420;
      later(replayEnd, () => setFill(level));
      if (status === "reached" || status === "released") later(replayEnd + 300, () => api.celebrate());
      if (status === "refunding" && level === 0) later(300, () => api.refund(0));
    }

    return () => { alive = false; timers.forEach(clearTimeout); feedRef.current = null; };
  });

  const empty = status === "open" && level === 0 && coins.length === 0;

  return (
    <div className="potstage">
      <div className={`potbtn static herop${glow ? " ok" : ""}`} aria-hidden="true">
        {empty && <span className="coin2 idle" style={{ left: "50%" }}><i /><em>be first</em></span>}
        {coins.map((c) => (
          <span key={c.id} className={`coin2 ${c.kind}`} style={{ left: `${c.x}%`, animationDelay: `${c.delay}ms` }}>
            <i style={{ animationDelay: `${c.delay}ms` }} />
            {c.label && <em>{c.label}</em>}
          </span>
        ))}
        <PotArt level={fill} />
      </div>
    </div>
  );
}
