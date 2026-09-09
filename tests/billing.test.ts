import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySamcartWebhook } from "@/lib/billing/verify";
import { mapSamcartType, normalizeSamcartPayload } from "@/lib/billing/normalize";
import {
  entitlementEffect,
  failedCancellationDoesNotCancelLocally,
  nextSubscriptionStatus,
} from "@/lib/billing/policy";
import { getDeletionGraceDays, MEMBERSHIP_SAMCART_PRODUCT_IDS } from "@/lib/billing/config";
import { detectLocalDrift } from "@/lib/billing/reconcile";
import { canAccessPaidContent } from "@/lib/entitlements/check";
import { readSamcartPeriodEnd } from "@/lib/billing/samcart-api";

describe("SamCart webhook verification", () => {
  it("rejects a missing secret", () => {
    expect(
      verifySamcartWebhook({ rawBody: "{}", secret: undefined, apiKey: "x" }).ok,
    ).toBe(false);
  });

  it("accepts a matching api_key", () => {
    expect(
      verifySamcartWebhook({
        rawBody: "{}",
        secret: "shared-secret",
        apiKey: "shared-secret",
      }).ok,
    ).toBe(true);
  });

  it("accepts a matching HMAC signature", () => {
    const rawBody = `{"type":"Order"}`;
    const signature = createHmac("sha256", "shared-secret").update(rawBody).digest("hex");
    expect(
      verifySamcartWebhook({
        rawBody,
        secret: "shared-secret",
        signature,
      }).ok,
    ).toBe(true);
  });
});

describe("SamCart event mapping", () => {
  it("maps purchase, failure, delinquency, refund, and cancel events", () => {
    expect(mapSamcartType("Product Purchased")).toBe("purchase");
    expect(mapSamcartType("Subscription Charge Failed")).toBe("charge_failed");
    expect(mapSamcartType("Subscription Delinquent")).toBe("delinquent");
    expect(mapSamcartType("Subscription Recovered")).toBe("recovered");
    expect(mapSamcartType("Product Refunded")).toBe("refund");
    expect(mapSamcartType("Cancel")).toBe("canceled");
    expect(mapSamcartType("Prospect created")).toBe("ignored");
  });

  it("normalizes a purchase payload", () => {
    const event = normalizeSamcartPayload({
      type: "Order",
      product: { id: 1001, name: "Membership", price: 25 },
      customer: { email: "Pay@Example.com" },
      order: { id: 55, total: 25, subscription_id: 99 },
    });
    expect(event.type).toBe("purchase");
    expect(event.email).toBe("pay@example.com");
    expect(event.samcartProductId).toBe("1001");
    expect(event.amountCents).toBe(2500);
    expect(event.providerEventId).toContain("55");
  });
});

describe("entitlement policy", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("grants on purchase and keeps access after a failed charge", () => {
    expect(nextSubscriptionStatus("purchase", null)).toBe("ACTIVE");
    expect(nextSubscriptionStatus("charge_failed", "ACTIVE")).toBe("PAST_DUE");
    expect(entitlementEffect("charge_failed", null, now)).toEqual({ kind: "keep" });
  });

  it("revokes on delinquency and refund, restores on recovery", () => {
    expect(nextSubscriptionStatus("delinquent", "PAST_DUE")).toBe("DELINQUENT");
    expect(entitlementEffect("delinquent", null, now)).toEqual({
      kind: "revoke",
      immediate: true,
    });
    expect(entitlementEffect("refund", null, now)).toEqual({
      kind: "revoke",
      immediate: true,
    });
    expect(nextSubscriptionStatus("recovered", "DELINQUENT")).toBe("ACTIVE");
    expect(entitlementEffect("recovered", null, now)).toEqual({ kind: "grant" });
  });

  it("keeps access until SamCart period end when a period remains", () => {
    const periodEnd = new Date("2026-10-01T00:00:00.000Z");
    expect(entitlementEffect("canceled", periodEnd, now)).toEqual({
      kind: "set_end",
      endsAt: periodEnd,
    });
    expect(
      canAccessPaidContent(
        [
          {
            status: "ACTIVE",
            startsAt: new Date("2026-01-01"),
            endsAt: periodEnd,
            revokedAt: null,
          },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("uses SamCart's reported 31-day trial period with no product override", () => {
    const periodEnd = new Date("2026-10-10T12:00:00.000Z");
    expect(entitlementEffect("canceled", periodEnd, now)).toEqual({
      kind: "set_end",
      endsAt: periodEnd,
    });
  });

  it("does not treat an unconfirmed cancel as canceled", () => {
    expect(failedCancellationDoesNotCancelLocally(false)).toBe(true);
    expect(failedCancellationDoesNotCancelLocally(true)).toBe(false);
  });
});

describe("reconciliation detection", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("auto-fixes paying/no access and alerts on access/not paying, orphans, and duplicates", () => {
    const findings = detectLocalDrift({
      now,
      subscriptions: [
        {
          id: "sub-1",
          userId: "user-1",
          productId: "prod-1",
          status: "ACTIVE",
          samcartSubscriptionId: "sc-1",
        },
        {
          id: "sub-2",
          userId: "user-1",
          productId: "prod-1",
          status: "ACTIVE",
          samcartSubscriptionId: "sc-2",
        },
        {
          id: "sub-3",
          userId: "user-2",
          productId: "prod-1",
          status: "CANCELED",
          samcartSubscriptionId: "sc-3",
        },
      ],
      entitlements: [
        {
          id: "ent-ghost",
          userId: "user-2",
          productId: "prod-1",
          subscriptionId: "sub-3",
          source: "SUBSCRIPTION",
          status: "ACTIVE",
          startsAt: new Date("2026-01-01"),
          endsAt: null,
          revokedAt: null,
        },
      ],
    });
    expect(findings.some((item) => item.kind === "paying_no_access" && item.severity === "auto_fix")).toBe(true);
    expect(findings.some((item) => item.kind === "access_not_paying" && item.severity === "alert")).toBe(true);
    expect(findings.some((item) => item.kind === "duplicate_subscription")).toBe(true);
  });
});

describe("accepted billing decisions", () => {
  it("defaults deletion grace to 7 days", () => {
    const previous = process.env.ACCOUNT_DELETION_GRACE_DAYS;
    delete process.env.ACCOUNT_DELETION_GRACE_DAYS;
    expect(getDeletionGraceDays()).toBe(7);
    if (previous == null) delete process.env.ACCOUNT_DELETION_GRACE_DAYS;
    else process.env.ACCOUNT_DELETION_GRACE_DAYS = previous;
  });

  it("maps both 1-month trial products without special-casing period math", () => {
    expect([...MEMBERSHIP_SAMCART_PRODUCT_IDS]).toEqual(["1069358", "1069354"]);
    const periodEnd = readSamcartPeriodEnd({
      data: { service_end_date: "2026-10-10T12:00:00.000Z" },
    });
    expect(periodEnd?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
});
