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
  // anything that needs a person is an error status, so the scheduled job fails and github emails about it:
  // statuses that couldn't be read (502), pots that weren't scanned this run, a payout or refund that
  // failed, or a relayer running out of gas money (500)
  const status = result.unreadable || (result.total ?? 0) > result.scanned ? 502 : result.failed.length || result.low ? 500 : 200;
  return NextResponse.json(result, { status });
}
