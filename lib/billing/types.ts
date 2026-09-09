import type { SubscriptionStatus } from "@prisma/client";

export const CANONICAL_EVENT_TYPES = [
  "purchase",
  "charge",
  "charge_failed",
  "delinquent",
  "recovered",
  "canceled",
  "cancel_scheduled",
  "restarted",
  "completed",
  "refund",
  "partial_refund",
  "ignored",
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number];

export type CanonicalBillingEvent = {
  type: CanonicalEventType;
  rawType: string;
  providerEventId: string;
  email: string | null;
  samcartProductId: string | null;
  samcartProductName: string | null;
  samcartOrderId: string | null;
  samcartSubscriptionId: string | null;
  samcartCustomerId: string | null;
  amountCents: number | null;
  currency: string | null;
  gateway: string | null;
  interval: string | null;
  periodEnd: Date | null;
  cancelAt: Date | null;
};

export type EntitlementEffect =
  | { kind: "grant" }
  | { kind: "keep" }
  | { kind: "revoke"; immediate: true }
  | { kind: "set_end"; endsAt: Date };

export type PayingSubscriptionStatus = Extract<
  SubscriptionStatus,
  "ACTIVE" | "PAST_DUE" | "CANCELING" | "COMPED"
>;

export const PAYING_STATUSES: SubscriptionStatus[] = [
  "ACTIVE",
  "PAST_DUE",
  "CANCELING",
  "COMPED",
];

export function isPayingStatus(status: SubscriptionStatus) {
  return PAYING_STATUSES.includes(status);
}
