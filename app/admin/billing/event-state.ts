import type { BadgeTone } from "@/components/app/ui";

/**
 * Where a SamCart webhook got to, as a badge.
 *
 * The billing page and the webhook log read the same four timestamps, so they
 * name the state the same way. Processed wins over everything; a dead letter
 * is worse than a failure that is still being retried.
 */
export function billingEventState(event: {
  processedAt: Date | null;
  deadLetteredAt: Date | null;
  failedAt: Date | null;
}): { label: string; tone: BadgeTone } {
  if (event.processedAt) return { label: "Processed", tone: "success" };
  if (event.deadLetteredAt) return { label: "Dead letter", tone: "danger" };
  if (event.failedAt) return { label: "Failed", tone: "warning" };
  return { label: "Queued", tone: "neutral" };
}
