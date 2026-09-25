import { NETWORK, OTHER_SITE } from "@/lib/config";

/** live | test. the same app runs as two sites; this links to the other one. hidden until that site is set */
export function NetSwitch() {
  if (!OTHER_SITE) return null;
  const live = NETWORK === "mainnet";
  return (
    <span className="netswitch" role="group" aria-label="live or test">
      {live ? <span className="on" aria-current="true">live</span>
        : <a href={OTHER_SITE} data-tip="the live app, with real usdc on arc">live</a>}
      {live ? <a href={OTHER_SITE} data-tip="try it free with test dollars">test</a>
        : <span className="on" aria-current="true">test</span>}
    </span>
  );
}

/** a thin bar across the top of every testnet page, so test dollars are never mistaken for real ones */
export function TestnetStrip() {
  if (NETWORK === "mainnet") return null;
  return (
    <div className="teststrip" role="note">
      <span>test mode · free test dollars</span>
      {OTHER_SITE && <a className="teststrip-go" href={OTHER_SITE}>go live →</a>}
    </div>
  );
}
