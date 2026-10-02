import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { runAutomations } from "@/lib/automation/engine";
import { seedAutomationRules } from "@/lib/automation/initial-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The automation sweep (BUILD.md §15).
 *
 * Every enabled rule looks at who currently matches it and acts on anyone it
 * has not already acted on for that state. Safe to run as often as you like:
 * the dedupe key on each execution is what stops a member hearing the same
 * thing twice, not the schedule.
 *
 * `?dryRun=1` runs every rule, including disabled ones, without acting and
 * without consuming anything — the preview behind the console's "Dry run".
 * `?seed=1` adds any shipped rule that is missing, all disabled.
 *
 * Secret-gated like every job (DEC-011). Vercel Cron issues a GET.
 */
async function run(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const seeded = params.get("seed") === "1" ? await seedAutomationRules() : null;
  const dryRun = params.get("dryRun") === "1";
  const result = await runAutomations({ dryRun, includeDisabled: dryRun });
  return Response.json({ ok: true, seeded, result });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
