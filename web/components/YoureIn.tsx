"use client";

import { useRef, useState } from "react";
import { useMountEffect } from "@/hooks/useMountEffect";
import { Mascot, type Mood } from "./Mascot";
import { CountUp, type Counter } from "./CountUp";

/**
 * the moment after paying: your coin, with your name on it, drops into the pot, the pot fills to its
 * new level and the total rolls up. about a second and a half, the best one in the app. reduced motion
 * shows the end state straight away
 */
export function YoureIn({ label, before, after, goal, format }: {
  label: string; // "maya · $20", shown on the coin
  before: number; // the pot's total before this chip-in
  after: number;
  goal: number;
  format: (n: number) => string;
}) {
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [level, setLevel] = useState(goal ? (reduced ? after : before) / goal : 0);
  const counters = useRef(new Set<Counter>());
  const [mood, setMood] = useState<Mood>(reduced ? "happy" : "look"); // watches its coin fall, then is happy
  useMountEffect(() => {
    if (reduced) { counters.current.forEach((c) => c.to(after)); return; }
    navigator.vibrate?.(25); // android: a small tap as the coin lands. iphones do not allow it on the web
    const land = window.setTimeout(() => { setLevel(goal ? after / goal : 0); setMood(after >= goal ? "stars" : "happy"); counters.current.forEach((c) => c.to(after)); }, 620);
    return () => clearTimeout(land);
  });
  return (
    <div className="youre-in" aria-hidden="true">
      <div className="potbtn static herop youre-in-pot">
        {!reduced && <span className="coin2 in" style={{ left: "50%" }}><i /><em>{label}</em></span>}
        <Mascot mood={mood} level={level} />
      </div>
      <div className="youre-in-count"><CountUp value={reduced ? after : before} format={format} counters={counters} /> <small>of {format(goal)}</small></div>
    </div>
  );
}
