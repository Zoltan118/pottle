import { NextResponse } from "next/server";

// the version that is live right now. the app asks this when it comes back to the screen, and
// reloads into the new one if it is running an older deploy. never cached
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ v: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" }, { headers: { "Cache-Control": "no-store" } });
}
