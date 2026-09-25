import { NETWORK, OTHER_SITE } from "@/lib/config";

/** real | test. the same app runs as two sites; this links to the other one. hidden until that site is set */
export function NetSwitch() {
  if (!OTHER_SITE) return null;
  const real = NETWORK === "mainnet";
  return (
    <span className="netswitch" role="group" aria-label="network">
      {real ? <span className="on" aria-current="true">real</span>
        : <a href={OTHER_SITE} data-tip="the real one, with real usdc">real</a>}
      {real ? <a href={OTHER_SITE} data-tip="try it free with play money">test</a>
        : <span className="on" aria-current="true">test</span>}
    </span>
  );
}

/** a thin bar across the top of every testnet page, so play money is never mistaken for the real thing */
export function TestnetStrip() {
  if (NETWORK === "mainnet") return null;
  return (
    <div className="teststrip" role="note">
      <span>play money · nothing here is real</span>
      {OTHER_SITE && <a href={OTHER_SITE}>the real one ↗</a>}
    </div>
  );
}
