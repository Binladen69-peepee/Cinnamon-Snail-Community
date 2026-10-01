import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { processDeliveries } from "@/lib/notifications/delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The delivery sweep: sends any email or push still in the outbox.
 *
 * Most deliveries never reach this. They are sent right after the request that
 * created them; this picks up what that missed — a provider outage, a timeout,
 * a function frozen before it finished — and retries it on its backoff
 * schedule. Rows are claimed before sending, so this can overlap with itself
 * or with an after-response send without anything going out twice.
 *
 * Secret-gated like every job (DEC-011). Vercel Cron issues a GET.
 */
async function run(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const result = await processDeliveries({ limit: 300 });
  return Response.json({ ok: true, result });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
