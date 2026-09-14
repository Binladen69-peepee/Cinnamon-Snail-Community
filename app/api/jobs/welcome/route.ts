import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { sendDueWelcomeMessages } from "@/lib/messages/welcome";

/**
 * The welcome DM sweep.
 *
 * DEC-011: no Inngest yet, so scheduled work is a secret-gated request that a
 * cron hits on a timer. The sweep does nothing when nothing is due, and
 * overlapping runs are safe — each job is claimed with a guarded update inside
 * a transaction, so a slow run and the next run cannot both send.
 *
 * NOT currently on a schedule, and the feature ships disabled, so nothing is
 * stranded by that. The Vercel account is on Hobby, which caps Cron at once
 * per day — a deploy carrying `*\/5 * * * *` is rejected outright. A daily
 * sweep was not substituted, because it would quietly turn the admin panel's
 * "minutes" into "sometime tomorrow"; better that the schedule is visibly
 * absent than silently wrong.
 *
 * To turn it on, either upgrade to Pro and add to vercel.json:
 *   { "crons": [{ "path": "/api/jobs/welcome", "schedule": "*\/5 * * * *" }] }
 * or point any external scheduler at this URL with the job secret. Whatever
 * drives it, the schedule is the *resolution* of the delay, not the delay: a
 * DM due at ten minutes goes out on the first sweep at or after that mark.
 *
 * Either way `BILLING_JOB_SECRET` must be set in production — without it this
 * route fails shut there, which is why it is currently unreachable.
 *
 * GET and POST both work. Vercel Cron issues a GET, which is why it is here at
 * all; POST is kept so the sweep can be triggered by hand the same way the
 * billing jobs are. Neither mutates anything a second call would duplicate.
 */
async function run(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const result = await sendDueWelcomeMessages();
  return Response.json({ ok: true, result });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
