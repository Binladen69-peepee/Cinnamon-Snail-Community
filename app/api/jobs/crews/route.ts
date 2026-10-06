import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { runCrewsJob } from "@/lib/crews/job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily crews pass (DEC-078).
 *
 * Dates the membership subscriptions SamCart has not dated yet, reads a batch
 * of RightMessage survey answers from Kit, then rebuilds the automatic crews —
 * cohort, roadmap and survey — and keeps each crew's group chat in step.
 * Opt-in crews and the rows members chose themselves are never touched.
 * Idempotent: two runs at once, or one straight after another, end in the
 * same crews.
 *
 * Secret-gated like every job (DEC-011). Vercel Cron issues a GET.
 */
async function run(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const result = await runCrewsJob({ trigger: "cron" });
  return Response.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
