import "server-only";

// best effort only: each serverless instance keeps its own counts, so these slow a spammer down
// rather than stop a determined one. the hard limits are the $1 minimum and the reserve floor.
const hits = new Map<string, number[]>();

/** true if `key` has made fewer than `max` calls in the last `windowMs` (and records this one) */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
