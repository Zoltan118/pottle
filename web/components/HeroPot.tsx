"use client";

import { useRef, useState } from "react";
import { PotArt } from "./PotArt";

const GOAL = 200;

/** the landing toy: tap to drop $20 in. full says it's on, one more tap refunds everyone */
export function HeroPot() {
  const [amt, setAmt] = useState(120);
  const [hint, setHint] = useState("tap the pot");
  const coin = useRef<HTMLSpanElement>(null);

  function tap() {
    if (amt >= GOAL) { setAmt(0); setHint("everyone got it back. again?"); return; }
    const c = coin.current!;
    c.classList.remove("drop"); void c.offsetWidth; c.classList.add("drop");
    setTimeout(() => {
      const next = amt + 20;
      setAmt(next);
      setHint(next >= GOAL ? "full. sarah's gift is on." : `${(GOAL - next) / 20} more to go`);
    }, 360);
  }

  return (
    <div className="potstage">
      <button className="potbtn" onClick={tap} aria-label="drop $20 in the pot">
        <span className="coin" ref={coin} />
        <PotArt level={amt / GOAL} />
      </button>
      <div className="count">${amt} <small>of ${GOAL}</small></div>
      <div className="hint" aria-live="polite">{hint}</div>
    </div>
  );
}
