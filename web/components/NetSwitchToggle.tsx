"use client";

import { useState } from "react";

/**
 * the switch itself. a pill slides to the side you tap, then the page moves to the other site, so it
 * feels like a switch rather than a link. while mainnet is not live yet, "live" nudges and says so
 */
export function NetSwitchToggle({ on, other, soon }: { on: "live" | "test"; other?: string; soon: boolean }) {
  const [side, setSide] = useState(on);
  const [nudge, setNudge] = useState(0);

  function pick(to: "live" | "test", e: React.MouseEvent) {
    if (to === on) return;
    e.preventDefault();
    if (soon) { setNudge((n) => n + 1); return; }
    if (!other) return;
    setSide(to);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => { window.location.href = other; }, reduced ? 0 : 200);
  }

  const item = (name: "live" | "test", tip: string) =>
    name === on
      ? <span className={side === name ? "on" : ""} aria-current="true">{name}</span>
      : soon && name === "live"
        ? <button type="button" className="soon" onClick={(e) => pick(name, e)} aria-describedby="netswitch-soon">{name}</button>
        : <a href={other} className={side === name ? "on" : ""} onClick={(e) => pick(name, e)} data-tip={tip}>{name}</a>;

  return (
    <span className="netswitch" role="group" aria-label="live or test" data-side={side}>
      <i className="netswitch-pill" aria-hidden="true" key={nudge} data-nudge={nudge > 0 || undefined} />
      {item("live", "the live app, with real usdc on arc")}
      {item("test", "try it free with test dollars")}
      {soon && <span id="netswitch-soon" role="status" className="netswitch-soon" key={`s${nudge}`} data-show={nudge > 0 || undefined}>{nudge > 0 ? "live soon. try it free here" : ""}</span>}
    </span>
  );
}
