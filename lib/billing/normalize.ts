import { createHash } from "crypto";
import type { CanonicalBillingEvent, CanonicalEventType } from "@/lib/billing/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dollarsToCents(value: unknown): number | null {
  const amount = asNumber(value);
  if (amount === null) return null;
  return Math.round(amount * 100);
}

const TYPE_MAP: Record<string, CanonicalEventType> = {
  order: "purchase",
  purchase: "purchase",
  "product purchased": "purchase",
  "checkout charged": "purchase",
  "product added to order": "purchase",
  "upsell purchased": "purchase",
  "subscription started": "purchase",
  "order completed": "purchase",
  charge: "charge",
  "subscription charged": "charge",
  recurringpaymentsucceeded: "charge",
  "recurring payment succeeded": "charge",
  "charge failed": "charge_failed",
  charge_failed: "charge_failed",
  "subscription charge failed": "charge_failed",
  "checkout failed": "charge_failed",
  recurringpaymentfailed: "charge_failed",
  "recurring payment failed": "charge_failed",
  delinquent: "delinquent",
  "subscription delinquent": "delinquent",
  recovered: "recovered",
  "subscription recovered": "recovered",
  recurringpaymentrecovered: "recovered",
  "recurring payment recovered": "recovered",
  canceled: "canceled",
  cancelled: "canceled",
  cancel: "canceled",
  "subscription canceled": "canceled",
  "subscription cancelled": "canceled",
  "cancel scheduled": "cancel_scheduled",
  "subscription cancel scheduled": "cancel_scheduled",
  "cancel scheduled stopped": "restarted",
  "subscription cancel scheduled stopped": "restarted",
  restarted: "restarted",
  "subscription restarted": "restarted",
  completed: "completed",
  "subscription completed": "completed",
  refund: "refund",
  "product refunded": "refund",
  "subscription charge refunded": "refund",
  "partial refund": "partial_refund",
  "product partially refunded": "partial_refund",
  "subscription charge partially refunded": "partial_refund",
  "prospect created": "ignored",
  "lead added": "ignored",
  "student added to course": "ignored",
  "student removed from course": "ignored",
  "student started course": "ignored",
  "student finished course": "ignored",
};

export function mapSamcartType(rawType: string): CanonicalEventType {
  const key = rawType.trim().toLowerCase();
  return TYPE_MAP[key] ?? TYPE_MAP[key.replace(/[_-]+/g, " ")] ?? "ignored";
}

export function providerEventId(input: {
  type: string;
  orderId?: string | null;
  productId?: string | null;
  subscriptionId?: string | null;
  email?: string | null;
  fallbackPayload?: unknown;
}) {
  const parts = [
    input.type,
    input.orderId ?? "",
    input.productId ?? "",
    input.subscriptionId ?? "",
    input.email ?? "",
  ];
  if (parts.some(Boolean) && (input.orderId || input.subscriptionId)) {
    return parts.join(":");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(input.fallbackPayload ?? input))
    .digest("hex")
    .slice(0, 32);
  return `${input.type}:hash:${digest}`;
}

export function normalizeSamcartPayload(payload: unknown): CanonicalBillingEvent {
  const root = asRecord(payload);
  const product = asRecord(root.product);
  const customer = asRecord(root.customer);
  const order = asRecord(root.order);
  const subscription = asRecord(root.subscription);
  const rawType = asString(root.type) ?? asString(root.event) ?? "unknown";
  const type = mapSamcartType(rawType);
  const email = asString(customer.email)?.toLowerCase() ?? null;
  const samcartProductId = asString(product.id);
  const samcartOrderId = asString(order.id) ?? asString(root.order_id);
  const samcartSubscriptionId =
    asString(order.subscription_id) ??
    asString(subscription.id) ??
    asString(root.subscription_id);
  const amount =
    asNumber(root.amount_cents) ??
    dollarsToCents(order.total) ??
    dollarsToCents(product.price) ??
    dollarsToCents(root.amount);

  return {
    type,
    rawType,
    providerEventId: providerEventId({
      type: `${type}:${rawType}`,
      orderId: samcartOrderId,
      productId: samcartProductId,
      subscriptionId: samcartSubscriptionId,
      email,
      fallbackPayload: payload,
    }),
    email,
    samcartProductId,
    samcartProductName: asString(product.name),
    samcartOrderId,
    samcartSubscriptionId,
    samcartCustomerId: asString(customer.id) ?? asString(order.customer_id),
    amountCents: amount,
    currency: asString(order.currency) ?? asString(root.currency) ?? "usd",
    gateway: asString(order.gateway) ?? asString(order.stripe_id) ?? null,
    interval: asString(subscription.interval) ?? asString(product.interval) ?? null,
    periodEnd:
      asDate(subscription.period_end) ??
      asDate(subscription.current_period_end) ??
      asDate(root.period_end),
    cancelAt: asDate(subscription.cancel_at) ?? asDate(root.cancel_at),
  };
}
