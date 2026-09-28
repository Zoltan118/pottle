"use client";

import { useMountEffect } from "@/hooks/useMountEffect";
import { Mascot } from "./Mascot";

// where each coin flies: across the screen, some higher and later than others
const COINS = [
  [-44, -62, 0], [-30, -78, 60], [-16, -58, 120], [-4, -84, 30], [8, -66, 90], [20, -80, 150], [34, -60, 40],
  [46, -72, 110], [-38, -46, 170], [26, -48, 200], [-10, -40, 230], [40, -42, 260], [-24, -70, 280], [14, -88, 190],
] as const;

/**
 * goal hit: a burst of gold coins over the whole screen and the words "goal hit." for everyone who has
 * the pot open, then it clears by itself. it never takes a tap, and reduced motion shows only the words
 */
export function Celebrate({ onDone, label = "goal hit." }: { onDone: () => void; label?: string }) {
  useMountEffect(() => {
    navigator.vibrate?.([30, 60, 30]);
    const t = window.setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  });
  return (
    <div className="party" aria-hidden="true">
      {COINS.map(([x, y, delay], i) => (
        <i key={i} style={{ "--x": `${x}vw`, "--y": `${y}vh`, animationDelay: `${delay}ms` } as React.CSSProperties} />
      ))}
      <b><Mascot mood="stars" level={1} size={92} />{label}</b>
    </div>
  );
}
