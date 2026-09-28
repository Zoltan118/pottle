import { NETWORK } from "@/lib/config";

/**
 * which network this site runs. the other site's live | test switch asks, so "live" only links to a
 * site that really is on mainnet, and says "live soon" while both sites still run the testnet app.
 * public and harmless: it is the same fact the page already shows
 */
export function GET() {
  return Response.json({ network: NETWORK }, {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=60, s-maxage=60" },
  });
}
