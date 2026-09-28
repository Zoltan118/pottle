"use client";

import { useQuery } from "@tanstack/react-query";

export type Net = "mainnet" | "testnet";

/** asks the other site which network it runs (its /api/network). null while unknown or unreachable */
export async function fetchNetwork(site: string): Promise<Net | null> {
  try {
    const r = await fetch(`${site.replace(/\/$/, "")}/api/network`, { signal: AbortSignal.timeout(4000) });
    const { network } = (await r.json()) as { network?: string };
    return network === "mainnet" || network === "testnet" ? network : null;
  } catch {
    return null;
  }
}

export const otherNetworkQuery = (site?: string) => ({
  queryKey: ["other-network", site],
  queryFn: () => fetchNetwork(site!),
  enabled: !!site,
  staleTime: 5 * 60_000,
});

export function useOtherNetwork(site?: string) {
  return useQuery(otherNetworkQuery(site)).data ?? null;
}
