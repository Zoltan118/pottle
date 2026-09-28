"use client";

import { useOtherNetwork } from "@/lib/otherNetwork";
import { ArrowOutIcon } from "./Icons";

/** the footer's link to the other site: "try it free" from mainnet, "go live" from testnet, but only once live really is live */
export function OtherSiteLink({ site, mainnet }: { site: string; mainnet: boolean }) {
  const other = useOtherNetwork(site);
  if (!mainnet && other !== "mainnet") return null;
  return <a href={site}>{mainnet ? "try it free" : "go live"}<ArrowOutIcon /></a>;
}
