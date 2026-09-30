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

/** gives back the last call recorded for `key`, for a slot that was claimed but not used */
export function forget(key: string) {
  const v = hits.get(key);
  if (v?.length) v.pop();
}

/**
 * the visitor's ip. on vercel, x-vercel-forwarded-for and x-real-ip are set by vercel's edge and cannot
 * be forged by the visitor; x-forwarded-for is only a fallback for running elsewhere, where the
 * first entry is whatever the client sent
 */
export const clientIp = (req: Request) =>
  req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
