import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { settleDue } from "@/lib/settle";

// called on a schedule: github actions every 10 minutes (.github/workflows/settle.yml), and vercel's own cron
// once a day (web/vercel.json) as a backup, since github switches schedules off in a repo with no commits
// for 60 days. vercel sends "Bearer $CRON_SECRET" by itself when CRON_SECRET is set on the project.
// pays out every pot that hit its goal and refunds every pot past its deadline.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[pottle] settle job off, missing: CRON_SECRET");
    return NextResponse.json({ error: "settle job off" }, { status: 503 });
  }
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await settleDue();
  if (result.off) return NextResponse.json({ error: "relay off" }, { status: 503 });
  // statuses that could not be read are an error the scheduler should show, not a quiet "nothing due"
  return NextResponse.json(result, { status: result.unreadable ? 502 : 200 });
}
