import { describe, expect, it } from "vitest";
import { readSamcartStartedAt, samcartStartFromWebhook } from "@/lib/billing/samcart-api";

/**
 * Where a member's original SamCart start comes from (DEC-078). The cohort
 * crews read only this, so the rules that keep a renewal or a migration from
 * posing as a start are pinned here.
 */
const received = new Date("2026-10-06T12:00:00Z");

describe("a subscription resource from the SamCart API", () => {
  it("prefers an explicit start date, then the subscription's creation", () => {
    expect(
      readSamcartStartedAt({ data: { start_date: "2024-09-15", created_at: "2025-01-01" } })?.toISOString(),
    ).toBe("2024-09-15T00:00:00.000Z");
    expect(readSamcartStartedAt({ id: 7, created_at: "2023-11-02T10:00:00Z" })?.toISOString()).toBe(
      "2023-11-02T10:00:00.000Z",
    );
  });

  it("is null when SamCart says nothing usable", () => {
    expect(readSamcartStartedAt({ data: { status: "active" } })).toBeNull();
    expect(readSamcartStartedAt({ data: { created_at: "not a date" } })).toBeNull();
    // A date in the future is a parsing accident, not a start.
    expect(readSamcartStartedAt({ data: { created_at: "2099-01-01" } }, received)).toBeNull();
  });
});

describe("a SamCart notification", () => {
  it("uses the subscription's own start when it carries one, whatever the event", () => {
    const payload = { subscription: { id: 9, created_at: "2023-02-01T00:00:00Z" } };
    expect(samcartStartFromWebhook(payload, { type: "charge", receivedAt: received })?.toISOString()).toBe(
      "2023-02-01T00:00:00.000Z",
    );
  });

  it("dates a purchase by its order, else by when it arrived", () => {
    expect(
      samcartStartFromWebhook(
        { order: { id: 1, created_at: "2026-10-05T09:30:00Z" } },
        { type: "purchase", receivedAt: received },
      )?.toISOString(),
    ).toBe("2026-10-05T09:30:00.000Z");
    expect(
      samcartStartFromWebhook({ order: { id: 1 } }, { type: "purchase", receivedAt: received }),
    ).toEqual(received);
  });

  it("never treats a renewal or a cancellation as the start", () => {
    for (const type of ["charge", "canceled", "refund", "restarted"]) {
      expect(
        samcartStartFromWebhook(
          { order: { created_at: "2026-10-05T09:30:00Z" }, created_at: "2026-10-05T09:30:00Z" },
          { type, receivedAt: received },
        ),
      ).toBeNull();
    }
  });
});
