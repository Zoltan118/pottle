"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { otherNetworkQuery, useOtherNetwork } from "@/lib/otherNetwork";

/**
 * the switch itself. a pill slides to the side you tap, then the page moves to the other site, so it
 * feels like a switch rather than a link. the other site is asked which network it runs: until one of
 * them is really on mainnet, "live" nudges and says it is coming instead of bouncing between two
 * testnet sites
 */
export function NetSwitchToggle({ on, other }: { on: "live" | "test"; other: string }) {
  const qc = useQueryClient();
  const otherNet = useOtherNetwork(other);
  const [side, setSide] = useState(on);
  const [nudge, setNudge] = useState(0);
  // on a testnet site, "live" is real only once the other site says it is on mainnet
  const soon = on === "test" && otherNet === "testnet";

  async function pick(to: "live" | "test", e: React.MouseEvent) {
    if (to === on) return;
    e.preventDefault();
    const net = otherNet ?? (await qc.fetchQuery(otherNetworkQuery(other)));
    if (on === "test" && net === "testnet") { setNudge((n) => n + 1); return; }
    setSide(to);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => { window.location.href = other; }, reduced ? 0 : 200);
  }

  const item = (name: "live" | "test", tip: string) =>
    name === on
      ? <span className={side === name ? "on" : ""} aria-current="true">{name}</span>
      : soon
        ? <button type="button" className="soon" onClick={(e) => pick(name, e)} aria-describedby="netswitch-soon">{name}</button>
        : <a href={other} className={side === name ? "on" : ""} onClick={(e) => pick(name, e)} data-tip={tip}>{name}</a>;

  return (
    <span className="netswitch" role="group" aria-label="live or test" data-side={side}>
      <i className="netswitch-pill" aria-hidden="true" key={nudge} data-nudge={nudge > 0 || undefined} />
      {item("live", "the live app, with real usdc on arc")}
      {item("test", "try it free with test dollars")}
      <span id="netswitch-soon" role="status" className="netswitch-soon" key={`s${nudge}`} data-show={nudge > 0 || undefined}>{nudge > 0 ? "live soon. try it free here" : ""}</span>
    </span>
  );
}
