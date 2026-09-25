import { retryFailedBillingEvents } from "@/lib/billing/process-event";
import { runNightlyReconciliation } from "@/lib/billing/reconcile";
import { getDeletionGraceDays } from "@/lib/billing/config";
import { purgeDueDeletions } from "@/lib/billing/deletion";
import { jobRequestAuthorized } from "@/lib/jobs/auth";

export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
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
  if (job === "events") {
    const { sendEventReminders } = await import("@/lib/events/jobs");
    return Response.json({ ok: true, result: await sendEventReminders() });
  }
  return Response.json({ ok: false, error: "unknown job" }, { status: 400 });
}
