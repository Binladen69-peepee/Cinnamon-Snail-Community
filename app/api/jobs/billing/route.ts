import { retryFailedBillingEvents } from "@/lib/billing/process-event";
import { runNightlyReconciliation } from "@/lib/billing/reconcile";
import { getDeletionGraceDays } from "@/lib/billing/config";
import { purgeDueDeletions } from "@/lib/billing/deletion";
import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { retryFailedKitSyncs } from "@/lib/billing/kit";

/**
 * Billing jobs, by `?job=`. POST for running one by hand; GET because that is
 * what Vercel Cron sends, which is how the nightly reconciliation (and its
 * daily email) actually gets run.
 */
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const url = new URL(request.url);
  const job = url.searchParams.get("job") ?? "retry";

  if (job === "retry") {
    const events = await retryFailedBillingEvents();
    // Kit tags that did not land the first time, re-sent from current access.
    const kit = await retryFailedKitSyncs();
    return Response.json({ ok: true, result: events, kit });
  }
  if (job === "reconcile") {
    return Response.json({ ok: true, result: await runNightlyReconciliation() });
  }
  if (job === "purge") {
    const grace = getDeletionGraceDays();
    return Response.json({ ok: true, result: await purgeDueDeletions(grace) });
  }
  if (job === "events") {
    const { sendEventReminders } = await import("@/lib/events/jobs");
    return Response.json({ ok: true, result: await sendEventReminders() });
  }
  return Response.json({ ok: false, error: "unknown job" }, { status: 400 });
}
