"use client";

import { useState } from "react";
import { Mascot, type Mood } from "@/components/Mascot";

const MOODS: { mood: Mood; when: string }[] = [
  { mood: "idle", when: "just sitting there" },
  { mood: "look", when: "a coin is falling in" },
  { mood: "happy", when: "a coin landed" },
  { mood: "stars", when: "goal hit" },
  { mood: "waiting", when: "empty, be first" },
  { mood: "worried", when: "deadline close, still short" },
  { mood: "calm", when: "refunded, all good" },
  { mood: "confused", when: "can't reach arc" },
  { mood: "hold", when: "paying: holding its breath" },
  { mood: "wince", when: "something went wrong" },
];
const LEVEL: Record<Mood, number> = { idle: 0.42, look: 0.42, happy: 0.55, stars: 1, waiting: 0, worried: 0.35, calm: 0, confused: 0.42, hold: 0.42, wince: 0.42 };
const STYLES = [
  { id: "a" as const, name: "a · eyes in the pot" },
  { id: "b" as const, name: "b · eyes on the lid" },
  { id: "c" as const, name: "c · eyes, blush and feet" },
];

export function MascotPreview() {
  const [mood, setMood] = useState<Mood>("idle");
  return (
    <main className="view">
      <section className="shell" style={{ display: "grid", gap: 28, paddingBlock: 28 }}>
        <h1 className="giant" style={{ fontSize: "clamp(48px, 9vw, 96px)" }}>meet pottle.</h1>
        <div className="chips" role="group" aria-label="mood" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MOODS.map((m) => <button key={m.mood} className="chip" aria-pressed={mood === m.mood} onClick={() => setMood(m.mood)}>{m.mood}</button>)}
        </div>
        <p className="hint" style={{ margin: 0 }}>{MOODS.find((m) => m.mood === mood)?.when}. move your pointer around: the big ones follow it with their eyes.</p>
        <div className="mascot-grid">
          {STYLES.map((s) => (
            <div key={s.id} className="plate mascot-card">
              <Mascot key={`${s.id}-${mood}`} style={s.id} mood={mood} level={LEVEL[mood]} size={180} track />
              <b>{s.name}</b>
              <div className="mascot-small" aria-hidden="true">
                <Mascot style={s.id} mood={mood} level={LEVEL[mood]} size={64} />
                <Mascot style={s.id} mood={mood} level={LEVEL[mood]} size={32} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
