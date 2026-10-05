// the browser's side of unlisted pot links (the server side is lib/potLink.ts): asks /api/potlink for the
// full links of pots the signed-in account is in. an empty map when it can't, so callers show a pot
// without its link rather than a link that won't open
export async function fetchPotLinks(ids: number[], authHeader: string): Promise<Record<number, string>> {
  if (!ids.length || !authHeader) return {};
  try {
    const r = await fetch("/api/potlink", { method: "POST", headers: { "content-type": "application/json", authorization: authHeader }, body: JSON.stringify({ ids }) });
    if (!r.ok) { console.warn(`[pottle] pot links unavailable (${r.status})`); return {}; }
    return ((await r.json()) as { links?: Record<number, string> }).links ?? {};
  } catch (e) {
    console.warn("[pottle] pot links unavailable:", e instanceof Error ? e.message : e);
    return {};
  }
}
