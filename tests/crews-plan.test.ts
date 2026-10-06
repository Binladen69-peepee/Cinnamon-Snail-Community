import { describe, expect, it } from "vitest";
import {
  planChatMembership,
  planCrewMembership,
  type ExistingCrewMember,
} from "@/lib/crews/plan";

/**
 * The recompute's rules without a database: it owns AUTO rows only, never an
 * OPT_IN row, never a crew it was not handed, and a second run is a no-op.
 */
function apply(rows: ExistingCrewMember[], plan: ReturnType<typeof planCrewMembership>) {
  const kept = rows.filter((row) => !plan.remove.includes(row.id));
  return [
    ...kept,
    ...plan.add.map((row, index) => ({ id: `new-${index}`, ...row, source: "AUTO" as const })),
  ];
}

describe("crew membership plan", () => {
  const desired = new Map([
    ["cohort", new Set(["ann", "bo"])],
    ["gf", new Set(["ann"])],
  ]);

  it("adds the members a rule wants and removes AUTO rows it no longer wants", () => {
    const plan = planCrewMembership(desired, [
      { id: "1", crewId: "cohort", userId: "ann", source: "AUTO" },
      { id: "2", crewId: "gf", userId: "cy", source: "AUTO" },
    ]);
    expect(plan.add).toEqual([
      { crewId: "cohort", userId: "bo" },
      { crewId: "gf", userId: "ann" },
    ]);
    expect(plan.remove).toEqual(["2"]);
  });

  it("never removes or duplicates an OPT_IN row, even where the rule disagrees", () => {
    const plan = planCrewMembership(desired, [
      // Opted in to a rule crew they no longer qualify for: left alone.
      { id: "1", crewId: "gf", userId: "dee", source: "OPT_IN" },
      // Opted in to one they also qualify for: not added a second time.
      { id: "2", crewId: "cohort", userId: "bo", source: "OPT_IN" },
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.add).not.toContainEqual({ crewId: "cohort", userId: "bo" });
  });

  it("does not touch crews it was not handed, so opt-in crews are never filled", () => {
    const plan = planCrewMembership(desired, [
      { id: "1", crewId: "wfpb-posse", userId: "ann", source: "OPT_IN" },
      { id: "2", crewId: "wfpb-posse", userId: "eve", source: "AUTO" },
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.add.some((row) => row.crewId === "wfpb-posse")).toBe(false);
  });

  it("changes nothing the second time it runs", () => {
    const rows: ExistingCrewMember[] = [
      { id: "1", crewId: "gf", userId: "cy", source: "AUTO" },
      { id: "2", crewId: "gf", userId: "dee", source: "OPT_IN" },
    ];
    const first = planCrewMembership(desired, rows);
    const second = planCrewMembership(desired, apply(rows, first));
    expect(second).toEqual({ add: [], remove: [] });
  });

  it("empties a crew whose rule now wants nobody, AUTO rows only", () => {
    const plan = planCrewMembership(new Map([["new", new Set<string>()]]), [
      { id: "1", crewId: "new", userId: "ann", source: "AUTO" },
      { id: "2", crewId: "new", userId: "bo", source: "OPT_IN" },
    ]);
    expect(plan).toEqual({ add: [], remove: ["1"] });
  });
});

describe("crew chat plan", () => {
  const t = (iso: string) => new Date(iso);

  it("adds new crew members and ends the seats of people who left the crew", () => {
    const plan = planChatMembership(
      [
        { userId: "ann", joinedAt: t("2026-01-01") },
        { userId: "bo", joinedAt: t("2026-01-02") },
      ],
      [
        { userId: "ann", leftAt: null },
        { userId: "cy", leftAt: null },
        { userId: "dee", leftAt: t("2026-01-03") },
      ],
    );
    expect(plan).toEqual({ add: ["bo"], leave: ["cy"], rejoin: [] });
  });

  it("respects a member who left the chat but stayed in the crew", () => {
    const plan = planChatMembership(
      [{ userId: "ann", joinedAt: t("2026-01-01") }],
      [{ userId: "ann", leftAt: t("2026-02-01") }],
    );
    expect(plan).toEqual({ add: [], leave: [], rejoin: [] });
  });

  it("brings back a member who left the crew and has since rejoined it", () => {
    const plan = planChatMembership(
      [{ userId: "ann", joinedAt: t("2026-03-01") }],
      [{ userId: "ann", leftAt: t("2026-02-01") }],
    );
    expect(plan).toEqual({ add: [], leave: [], rejoin: ["ann"] });
  });
});
