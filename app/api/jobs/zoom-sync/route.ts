import { NextResponse } from "next/server";
import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { revalidateLiveClasses } from "@/lib/events/revalidate";
import { runZoomSync } from "@/lib/zoom/sync";

export const maxDuration = 60;

/**
 * Live classes from Zoom, on a timer (DEC-079).
 *
 * Reads every configured Zoom user's upcoming meetings, keeps the ones whose
 * topic says LIVE CLASS, and brings the Live Classes page in line: new
 * meetings become classes, changed ones update, and a class whose meeting Zoom
 * confirms is gone is canceled (never deleted). Safe at any cadence and safe
 * twice at once; every run is recorded as a `ZoomSyncRun`.
 *
 * Without Zoom credentials it records that Zoom is not configured, changes
 * nothing, and still answers 200 so the cron does not read as broken.
 *
 * Gated by the same secret as every other `/api/jobs/*` route.
 */
export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const result = await runZoomSync({ trigger: "cron" });
  if (result.changed.length > 0) revalidateLiveClasses(result.changed);

  return NextResponse.json({
    ok: result.ok,
    configured: result.configured,
    scanned: result.scanned,
    created: result.created,
    updated: result.updated,
    canceled: result.canceled,
    errors: result.errors,
  });
}

/** Vercel Cron issues a GET, so the same work is reachable both ways. */
export async function GET(request: Request) {
  return POST(request);
}
