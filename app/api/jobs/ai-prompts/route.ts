import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { runGeneration } from "@/lib/ai/schedule";
import { publishDueDrafts } from "@/lib/ai/drafts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The cohost's daily pass (BUILD.md §16).
 *
 * Two jobs in one: top up each running schedule's queue of drafts, and publish
 * the approved ones whose time has come. Publishing only ever touches drafts a
 * human approved, so running this does not put anything in front of members
 * that nobody has read.
 *
 * Generation pauses itself when drafts pile up unreviewed, so an unattended
 * queue stops costing money rather than growing.
 *
 * Secret-gated like every job (DEC-011). Vercel Cron issues a GET.
 */
async function run(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const published = await publishDueDrafts();
  const generated = await runGeneration();
  return Response.json({ ok: true, published, generated });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
