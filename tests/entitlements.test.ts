import { describe, expect, it } from "vitest";
import {
  canAccessPaidContent,
  isEntitlementActive,
} from "@/lib/entitlements/check";

describe("entitlements", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it("treats active unexpired entitlements as active", () => {
    expect(
      isEntitlementActive(
        {
          status: "ACTIVE",
          startsAt: new Date("2026-01-01"),
          endsAt: new Date("2026-12-01"),
          revokedAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("revokes immediately when revokedAt is set", () => {
    expect(
      isEntitlementActive(
        {
          status: "ACTIVE",
          startsAt: new Date("2026-01-01"),
          endsAt: null,
          revokedAt: now,
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not grant access from expired rows", () => {
    expect(
      canAccessPaidContent(
        [
          {
            status: "EXPIRED",
            startsAt: new Date("2025-01-01"),
            endsAt: new Date("2026-01-01"),
            revokedAt: null,
          },
        ],
        now,
      ),
    ).toBe(false);
  });
});
