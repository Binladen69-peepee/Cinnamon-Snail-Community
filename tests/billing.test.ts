import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readSamcartApiKey, verifySamcartWebhook } from "@/lib/billing/verify";
import { mapSamcartType, normalizeSamcartPayload } from "@/lib/billing/normalize";
import {
  entitlementEffect,
  failedCancellationDoesNotCancelLocally,
  nextSubscriptionStatus,
} from "@/lib/billing/policy";
import { getDeletionGraceDays, MEMBERSHIP_SAMCART_PRODUCT_IDS } from "@/lib/billing/config";
import { detectLocalDrift } from "@/lib/billing/reconcile";
import { canAccessPaidContent } from "@/lib/entitlements/check";
import {
  readSamcartCancelDate,
  readSamcartNextRebill,
  readSamcartPeriodEnd,
} from "@/lib/billing/samcart-api";
import { formatAccessDate } from "@/lib/billing/cancel";

describe("where the SamCart secret arrives", () => {
  const URL_BASE = "https://cinnamon-snail-community.vercel.app/api/webhooks/samcart";

  it("reads the secret off the Notify URL query string", () => {
    // This is the shape SamCart actually sends: the merchant pastes the secret
    // into the Notify URL, and nothing carries it in the body. Reading only
    // the body 401'd every real webhook.
    expect(readSamcartApiKey({ url: `${URL_BASE}?api_key=s3cret`, body: {} })).toBe(
      "s3cret",
    );
  });

  it("still reads it from the body when the URL has none", () => {
    expect(readSamcartApiKey({ url: URL_BASE, body: { api_key: "s3cret" } })).toBe(
      "s3cret",
    );
  });

  it("prefers the URL when both are present", () => {
    expect(
      readSamcartApiKey({ url: `${URL_BASE}?api_key=from-url`, body: { api_key: "from-body" } }),
    ).toBe("from-url");
  });

  it("is null when neither carries one, so verification rejects", () => {
    expect(readSamcartApiKey({ url: URL_BASE, body: {} })).toBeNull();
    expect(readSamcartApiKey({ url: URL_BASE, body: { api_key: 42 } })).toBeNull();
    expect(
      verifySamcartWebhook({
        rawBody: "{}",
        secret: "shared",
        apiKey: readSamcartApiKey({ url: URL_BASE, body: {} }),
      }).ok,
    ).toBe(false);
  });

  it("survives a malformed request url rather than throwing", () => {
    expect(readSamcartApiKey({ url: "/api/webhooks/samcart", body: { api_key: "s" } })).toBe("s");
  });

  it("accepts a real query-string secret end to end", () => {
    expect(
      verifySamcartWebhook({
        rawBody: '{"type":"ping"}',
        secret: "shared",
        apiKey: readSamcartApiKey({ url: `${URL_BASE}?api_key=shared`, body: {} }),
      }).ok,
    ).toBe(true);
  });
});

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
    expect(mapSamcartType("Subscription cancellation")).toBe("canceled");
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

  it("never hands access back to a cancellation whose paid period has ended", () => {
    // The auto-fix grants access to a paying subscription with none. A
    // subscription set to cancel stops paying on its end date, so past it an
    // expired entitlement is the right state, not drift.
    const subscription = {
      userId: "user-1",
      productId: "prod-1",
      status: "CANCELING" as const,
      samcartSubscriptionId: "sc-1",
    };
    const ended = detectLocalDrift({
      now,
      subscriptions: [{ ...subscription, id: "sub-ended", cancelAt: new Date("2026-09-01T00:00:00Z") }],
      entitlements: [],
    });
    expect(ended).toEqual([]);

    const running = detectLocalDrift({
      now,
      subscriptions: [{ ...subscription, id: "sub-running", cancelAt: new Date("2026-10-01T00:00:00Z") }],
      entitlements: [],
    });
    expect(running.map((item) => item.kind)).toEqual(["paying_no_access"]);
  });
});

describe("cancelling at the end of the billing period", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");

  it("keeps access to the scheduled end, and never cuts it short on a missing date", () => {
    expect(nextSubscriptionStatus("cancel_scheduled", "ACTIVE")).toBe("CANCELING");
    const end = new Date("2026-11-07T00:18:35.000Z");
    expect(entitlementEffect("cancel_scheduled", end, now)).toEqual({ kind: "set_end", endsAt: end });
    expect(entitlementEffect("cancel_scheduled", null, now)).toEqual({ kind: "keep" });
    expect(entitlementEffect("cancel_scheduled", new Date("2026-10-01T00:00:00Z"), now)).toEqual({
      kind: "revoke",
      immediate: true,
    });
  });

  it("reads the date a scheduled cancellation takes effect, in UTC", () => {
    // SamCart's shape: UTC written without a zone. Read as local time it
    // would move by the server's offset.
    const raw = {
      id: 1337,
      status: "active",
      next_rebilling_date: "2026-11-07 00:18:35",
      cancel_schedule: { status: "scheduled", cancel_date: "2026-11-07 00:18:35" },
    };
    expect(readSamcartCancelDate(raw)?.toISOString()).toBe("2026-11-07T00:18:35.000Z");
    expect(readSamcartPeriodEnd(raw)?.toISOString()).toBe("2026-11-07T00:18:35.000Z");
    expect(readSamcartNextRebill(raw)?.toISOString()).toBe("2026-11-07T00:18:35.000Z");
    // Wrapped in `data`, as the list endpoint returns it.
    expect(readSamcartCancelDate({ data: raw })?.toISOString()).toBe("2026-11-07T00:18:35.000Z");
  });

  it("ignores a cancel date that is no longer scheduled", () => {
    expect(
      readSamcartCancelDate({ cancel_schedule: { status: "canceled", cancel_date: "2026-11-07 00:18:35" } }),
    ).toBeNull();
    expect(readSamcartCancelDate({ status: "active", cancel_schedule: null })).toBeNull();
  });

  it("writes the access date the way a member reads it", () => {
    expect(formatAccessDate(new Date("2026-11-07T00:18:35.000Z"))).toBe("November 7, 2026");
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

  it("maps the live products and both 1-month trial products without special-casing period math", () => {
    expect([...MEMBERSHIP_SAMCART_PRODUCT_IDS]).toEqual(["849150", "849151", "1069358", "1069354"]);
    const periodEnd = readSamcartPeriodEnd({
      data: { service_end_date: "2026-10-10T12:00:00.000Z" },
    });
    expect(periodEnd?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
});

describe("MRR", () => {
  it("counts an annual plan as a twelfth of its price each month", async () => {
    const { monthlyEquivalentCents } = await import("@/lib/billing/metrics");
    expect(monthlyEquivalentCents(1900, "month")).toBe(1900);
    expect(monthlyEquivalentCents(1900, "1 Month")).toBe(1900);
    expect(monthlyEquivalentCents(19900, "year")).toBe(1658);
    expect(monthlyEquivalentCents(19900, "annual")).toBe(1658);
    expect(monthlyEquivalentCents(1900, null)).toBe(1900);
    expect(monthlyEquivalentCents(null, "year")).toBe(0);
  });
});
