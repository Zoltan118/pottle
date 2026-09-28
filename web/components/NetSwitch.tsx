import { LIVE_SOON, NETWORK, OTHER_SITE } from "@/lib/config";
import { NetSwitchToggle } from "./NetSwitchToggle";

/** live | test. the same app runs as two sites; this switches to the other one. hidden until there is one */
export function NetSwitch() {
  const live = NETWORK === "mainnet";
  // before mainnet launches both sites run the testnet app, so "live" has nowhere real to go yet
  const soon = !live && LIVE_SOON;
  if (!OTHER_SITE && !soon) return null;
  return <NetSwitchToggle on={live ? "live" : "test"} other={soon ? undefined : OTHER_SITE} soon={soon} />;
}
