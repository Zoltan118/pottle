"use client";

import { useRef, useState } from "react";
import { CountUp, type Counter } from "@/components/CountUp";
import { Celebrate } from "@/components/Celebrate";
import { YoureIn } from "@/components/YoureIn";
import { money } from "@/lib/pot";

export function MotionPreview() {
  const counters = useRef(new Set<Counter>());
  const [total, setTotal] = useState(21);
  const [inKey, setInKey] = useState(0);
  const [party, setParty] = useState(false);
  const m = (d: number) => money(d, "usd");
  return (
    <main className="view">
      <section className="flow" style={{ gap: 24 }}>
        <h1 className="giant q">motion.</h1>
        <div className="amount"><CountUp value={21} format={m} counters={counters} /> <small>of $60</small></div>
        <div className="acts">
          <button className="btn sm ghost" onClick={() => { const n = total + 20; setTotal(n); counters.current.forEach((c) => c.to(n)); }}>someone chips in $20</button>
          <button className="btn sm ghost" onClick={() => setInKey((k) => k + 1)}>you&apos;re in</button>
          <button className="btn sm ghost" onClick={() => setParty(true)}>goal hit</button>
        </div>
        {inKey > 0 && <div key={inKey} className="plate"><h2 className="giant">you&apos;re in.</h2><YoureIn label="maya · $20" before={21} after={41} goal={60} format={m} /></div>}
      </section>
      {party && <Celebrate onDone={() => setParty(false)} />}
    </main>
  );
}
