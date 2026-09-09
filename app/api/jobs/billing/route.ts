import { retryFailedBillingEvents } from "@/lib/billing/process-event";
import { runNightlyReconciliation } from "@/lib/billing/reconcile";
import { getDeletionGraceDays } from "@/lib/billing/config";
import { purgeDueDeletions } from "@/lib/billing/deletion";

function authorized(request: Request) {
  const secret = process.env.BILLING_JOB_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") ?? request.headers.get("x-job-secret");
  return header === `Bearer ${secret}` || header === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const url = new URL(request.url);
  const job = url.searchParams.get("job") ?? "retry";

  if (job === "retry") {
    return Response.json({ ok: true, result: await retryFailedBillingEvents() });
  }
  if (job === "reconcile") {
    return Response.json({ ok: true, result: await runNightlyReconciliation() });
  }
  if (job === "purge") {
    const grace = getDeletionGraceDays();
    return Response.json({ ok: true, result: await purgeDueDeletions(grace) });
  }
  return Response.json({ ok: false, error: "unknown job" }, { status: 400 });
}
