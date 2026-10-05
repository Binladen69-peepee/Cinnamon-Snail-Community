import { describe, expect, it } from "vitest";
import {
  intervalUnresolved,
  normalizeInterval,
  planTags,
  type IntervalTags,
} from "@/lib/billing/kit-tags";

const MONTHLY = "Vegan University Monthly";
const ANNUAL = "Vegan University Annual";

/** The membership, as the client confirmed it. */
const membership: IntervalTags = {
  kitTag: null,
  kitTagMonthly: MONTHLY,
  kitTagAnnual: ANNUAL,
};

describe("normalizeInterval", () => {
  it("reads the shapes SamCart sends", () => {
    for (const value of ["month", "Monthly", "1 month", "MONTH", "per month"]) {
      expect(normalizeInterval(value), value).toBe("month");
    }
    for (const value of ["year", "Yearly", "annual", "ANNUALLY", "1 year"]) {
      expect(normalizeInterval(value), value).toBe("year");
    }
  });

  it("refuses to guess anything else", () => {
    for (const value of [null, undefined, "", "week", "lifetime", "quarterly", "???"]) {
      expect(normalizeInterval(value), String(value)).toBeNull();
    }
  });
});

describe("planTags — the confirmed mapping", () => {
  it("a monthly purchase gets the monthly tag only", () => {
    expect(planTags({ product: membership, interval: "month", action: "grant" })).toEqual({
      add: [MONTHLY],
      remove: [ANNUAL],
    });
  });

  it("an annual purchase gets the annual tag only", () => {
    expect(planTags({ product: membership, interval: "year", action: "grant" })).toEqual({
      add: [ANNUAL],
      remove: [MONTHLY],
    });
  });

  it("switching plan moves the member rather than stacking both tags", () => {
    // Monthly member upgrades to annual: annual on, monthly off, in one plan.
    const upgrade = planTags({ product: membership, interval: "year", action: "grant" });
    expect(upgrade.add).toEqual([ANNUAL]);
    expect(upgrade.remove).toEqual([MONTHLY]);
    const downgrade = planTags({ product: membership, interval: "month", action: "grant" });
    expect(downgrade.add).toEqual([MONTHLY]);
    expect(downgrade.remove).toEqual([ANNUAL]);
  });

  it("cancellation removes both, because they are on neither plan", () => {
    const plan = planTags({ product: membership, interval: "month", action: "revoke" });
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual(expect.arrayContaining([MONTHLY, ANNUAL]));
    // The interval does not change what a revoke clears.
    expect(planTags({ product: membership, interval: null, action: "revoke" }).remove).toEqual(
      expect.arrayContaining([MONTHLY, ANNUAL]),
    );
  });

  it("adds nothing when the interval is unknown, rather than guessing", () => {
    const plan = planTags({ product: membership, interval: null, action: "grant" });
    expect(plan.add).toEqual([]);
    // It still clears both, so an unknown interval cannot leave a stale tag on.
    expect(plan.remove).toEqual(expect.arrayContaining([MONTHLY, ANNUAL]));
    expect(intervalUnresolved(membership, null)).toBe(true);
    expect(intervalUnresolved(membership, "month")).toBe(false);
  });

  it("is idempotent: the same plan twice asks for the same thing", () => {
    const once = planTags({ product: membership, interval: "month", action: "grant" });
    const twice = planTags({ product: membership, interval: "month", action: "grant" });
    expect(once).toEqual(twice);
  });

  it("does nothing for a product with no tags mapped", () => {
    const course: IntervalTags = { kitTag: null, kitTagMonthly: null, kitTagAnnual: null };
    expect(planTags({ product: course, interval: "month", action: "grant" })).toEqual({ add: [], remove: [] });
    expect(planTags({ product: course, interval: null, action: "revoke" })).toEqual({ add: [], remove: [] });
    expect(intervalUnresolved(course, null)).toBe(false);
  });

  it("keeps an interval-independent tag on a grant and clears it on a revoke", () => {
    const oneOff: IntervalTags = { kitTag: "Bought A Course", kitTagMonthly: null, kitTagAnnual: null };
    expect(planTags({ product: oneOff, interval: null, action: "grant" })).toEqual({
      add: ["Bought A Course"],
      remove: [],
    });
    expect(planTags({ product: oneOff, interval: null, action: "revoke" })).toEqual({
      add: [],
      remove: ["Bought A Course"],
    });
  });

  it("never asks to add and remove the same tag in one plan", () => {
    for (const interval of ["month", "year", null] as const) {
      for (const action of ["grant", "revoke"] as const) {
        const plan = planTags({ product: membership, interval, action });
        expect(plan.add.filter((tag) => plan.remove.includes(tag))).toEqual([]);
      }
    }
  });
});
