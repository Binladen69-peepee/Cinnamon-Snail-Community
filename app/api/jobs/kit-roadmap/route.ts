import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { queueRoadmapKitSyncForTrack, syncRoadmapToKit } from "@/lib/roadmap/kit-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The roadmap → Kit sweep.
 *
 * Most syncs happen right after the roadmap action that caused them; this
 * catches up whatever that missed — a Kit outage, a timeout, rate limiting —
 * on its backoff schedule. Each member is claimed before syncing, so this can
 * overlap with itself or with an after-response sync safely.
 *
 * `POST ?backfill=1` first re-queues every member with a roadmap. Use it once
 * after Kit credentials or track tags are first configured. Because the sync
 * only ever sends differences, a backfill on an already-synced member sends
 * nothing.
 *
 * Secret-gated like every job (DEC-011). Vercel Cron issues a GET.
 */
async function run(request: Request, allowBackfill: boolean) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const backfill = allowBackfill && new URL(request.url).searchParams.get("backfill") === "1";
  const queued = backfill ? await queueRoadmapKitSyncForTrack(null) : 0;
  const result = await syncRoadmapToKit({ limit: 50 });
  return Response.json({ ok: true, queued, result });
}

export async function GET(request: Request) {
  return run(request, false);
}

export async function POST(request: Request) {
  return run(request, true);
}
