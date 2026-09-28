import { NETWORK, OTHER_SITE } from "@/lib/config";
import { NetSwitchToggle } from "./NetSwitchToggle";

/** live | test. the same app runs as two sites; this switches to the other one. hidden until there is one */
export function NetSwitch() {
  if (!OTHER_SITE) return null;
  return <NetSwitchToggle on={NETWORK === "mainnet" ? "live" : "test"} other={OTHER_SITE} />;
}
