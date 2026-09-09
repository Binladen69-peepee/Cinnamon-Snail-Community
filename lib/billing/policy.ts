import type { SubscriptionStatus } from "@prisma/client";
import type { CanonicalEventType, EntitlementEffect } from "@/lib/billing/types";

export function nextSubscriptionStatus(
  type: CanonicalEventType,
  current: SubscriptionStatus | null,
): SubscriptionStatus | null {
  switch (type) {
    case "purchase":
    case "charge":
    case "restarted":
      return "ACTIVE";
    case "charge_failed":
      return current === "DELINQUENT" ? "DELINQUENT" : "PAST_DUE";
    case "delinquent":
      return "DELINQUENT";
    case "recovered":
      return "ACTIVE";
    case "cancel_scheduled":
      return "CANCELING";
    case "canceled":
      return "CANCELED";
    case "completed":
      return "CANCELED";
    case "refund":
      return "REFUNDED";
    case "partial_refund":
      return current ?? "ACTIVE";
    case "ignored":
      return current;
    default:
      return current;
  }
}

export function entitlementEffect(
  type: CanonicalEventType,
  periodEnd: Date | null,
  now = new Date(),
): EntitlementEffect {
  switch (type) {
    case "purchase":
    case "charge":
    case "recovered":
    case "restarted":
      return { kind: "grant" };
    case "charge_failed":
    case "partial_refund":
      return { kind: "keep" };
    case "delinquent":
    case "refund":
      return { kind: "revoke", immediate: true };
    case "canceled":
    case "cancel_scheduled":
    case "completed":
      if (periodEnd && periodEnd > now) {
        return { kind: "set_end", endsAt: periodEnd };
      }
      return { kind: "revoke", immediate: true };
    case "ignored":
      return { kind: "keep" };
    default:
      return { kind: "keep" };
  }
}

export function failedCancellationDoesNotCancelLocally(samcartConfirmed: boolean) {
  return !samcartConfirmed;
}
