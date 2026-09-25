import { NextResponse } from "next/server";
import { settleDue } from "@/lib/settle";

// called on a schedule (github actions every 30 minutes, see .github/workflows/settle.yml).
// pays out every pot that hit its goal and refunds every pot past its deadline.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[pottle] settle job off, missing: CRON_SECRET");
    return NextResponse.json({ error: "settle job off" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await settleDue();
  if (result.off) return NextResponse.json({ error: "relay off" }, { status: 503 });
  return NextResponse.json(result);
}
