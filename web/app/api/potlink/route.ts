import { NextResponse } from "next/server";
import { verifyUser } from "@/lib/auth";
import { allow, clientIp } from "@/lib/limits";
import { readPot } from "@/lib/pot";
import { LINKS_ON, potLink } from "@/lib/potLink";

// full pot links for the people in a pot. the app builds links in the browser (right after making a
// pot, and in the account's list of pots), which cannot hold the secret, so it asks here. a link is only
// handed to a signed-in account whose wallet made the pot or chipped into it: anyone else has to be sent it

const MAX_IDS = 20; // the account sheet lists at most 20 pots

export async function POST(req: Request) {
  if (!LINKS_ON) return NextResponse.json({ error: "links are off" }, { status: 503 });
  const who = await verifyUser(req);
  if (!who) return NextResponse.json({ error: "sign in again" }, { status: 401 });
  if (!allow(`potlink:${who.sub}`, 30, 60_000) || !allow(`potlink-ip:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "slow down" }, { status: 429 });
  }

  let ids: unknown;
  try { ids = (await req.json())?.ids; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || !ids.every((x) => Number.isSafeInteger(x) && x > 0)) {
    return NextResponse.json({ error: "bad ids" }, { status: 400 });
  }

  const mine = new Set(who.wallets);
  const links: Record<number, string> = {};
  try {
    await Promise.all([...new Set(ids as number[])].map(async (id) => {
      const pot = await readPot(id);
      if (!pot) return;
      const inIt = mine.has(pot.organiser.toLowerCase()) || pot.people.some((p) => mine.has(p.address.toLowerCase()));
      const path = inIt ? potLink(id) : null;
      if (path) links[id] = path;
    }));
  } catch (e) {
    console.warn("[pottle] potlink read failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "can't reach arc" }, { status: 503 });
  }
  return NextResponse.json({ links });
}
