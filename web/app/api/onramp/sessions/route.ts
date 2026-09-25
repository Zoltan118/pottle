import { NextResponse } from "next/server";
import { createOnrampServerKit, createSessionRouteHandler } from "@circle-fin/onramp-kit/server";
import { verifyUser } from "@/lib/auth";

// circle onramp kit: turns our long-lived key into a one-time session for the signed-in user's
// own wallet. the key never reaches the browser. set both base urls for sandbox, neither for production.
const apiKey = process.env.ONRAMP_API_KEY?.trim();
const baseUrl = process.env.ONRAMP_API_BASE_URL?.trim() || undefined;
const widgetBaseUrl = process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL?.trim() || undefined;
const referrerDomain = process.env.ONRAMP_REFERRER_DOMAIN?.trim() || undefined;

const handler = apiKey
  ? createSessionRouteHandler(createOnrampServerKit({ apiKey, baseUrl, widgetBaseUrl, referrerDomain }), {
      // only a signed-in user, and only into a wallet that is theirs
      authorize: async (request) => {
        const who = await verifyUser(request);
        if (!who) return false;
        const body = await request.clone().json().catch(() => null);
        const dest = String(body?.destinationAddress ?? "").toLowerCase();
        return who.wallets.includes(dest) && body?.appUserId === who.sub;
      },
    })
  : null;

export async function POST(req: Request) {
  if (!handler) {
    console.warn("[pottle] onramp off, missing: ONRAMP_API_KEY");
    return NextResponse.json({ error: "onramp off" }, { status: 503 });
  }
  return handler(req);
}
