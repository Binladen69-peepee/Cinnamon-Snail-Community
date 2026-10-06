import { describe, expect, it } from "vitest";
import {
  computeSimilarities,
  sharedPlace,
  similarityAllowed,
  similarityReason,
  type InteractionFacts,
  type SimilarityFacts,
} from "@/lib/social/similarities";
import type { CrewSummary } from "@/lib/crews/queries";

/**
 * "Show similarities", without a database: the privacy rules, the precision
 * of location, and the reasons a card gives.
 */

const japanese = { id: "i-jp", slug: "japanese", label: "Japanese", kind: "CUISINE" as const };
const thai = { id: "i-th", slug: "thai", label: "Thai", kind: "CUISINE" as const };
const baking = { id: "i-bk", slug: "baking", label: "Baking", kind: "TECHNIQUE" as const };
const glutenFreeTag = { id: "i-gf", slug: "gluten-free", label: "Gluten free", kind: "DIETARY" as const };

function facts(overrides: Partial<SimilarityFacts> = {}): SimilarityFacts {
  return {
    userId: "member",
    displayName: "Priya Shah",
    status: "ACTIVE",
    privacy: { showLocation: true, showLinks: true, showInterests: true },
    directoryVisible: true,
    matchingOptIn: true,
    skill: null,
    glutenFree: null,
    city: null,
    region: null,
    country: null,
    interests: [],
    roadmap: null,
    classes: [],
    liveClasses: [],
    ...overrides,
  };
}

const viewer = (overrides: Partial<SimilarityFacts> = {}) =>
  facts({ userId: "viewer", displayName: "Adam Sobel", ...overrides });

const noInteractions: InteractionFacts = {
  viewerFollowsMember: false,
  memberFollowsViewer: false,
  sharedFollowees: [],
  sharedFolloweeCount: 0,
  memberRepliedToViewer: 0,
  viewerRepliedToMember: 0,
  memberReactedToViewer: 0,
  viewerReactedToMember: 0,
};

const crew = (id: string, kind: CrewSummary["kind"] = "OPTIONAL"): CrewSummary => ({
  id,
  slug: id,
  name: `Crew ${id}`,
  kind,
});

const keys = (similarity: { groups: { key: string }[] }) => similarity.groups.map((group) => group.key);

describe("whether there is a panel at all", () => {
  it("is never offered across a block, in either direction", () => {
    expect(similarityAllowed({ viewer: viewer(), member: facts(), blocked: true })).toBe(false);
  });

  it("is never offered on your own profile", () => {
    expect(similarityAllowed({ viewer: viewer(), member: viewer(), blocked: false })).toBe(false);
  });

  it("is not offered for a member who left the directory or is inactive", () => {
    expect(
      similarityAllowed({ viewer: viewer(), member: facts({ directoryVisible: false }), blocked: false }),
    ).toBe(false);
    expect(
      similarityAllowed({ viewer: viewer(), member: facts({ status: "SUSPENDED" }), blocked: false }),
    ).toBe(false);
  });

  it("is offered otherwise", () => {
    expect(similarityAllowed({ viewer: viewer(), member: facts(), blocked: false })).toBe(true);
  });
});

describe("interests", () => {
  it("lists the tags both picked, grouped by kind, each linking to the directory", () => {
    const result = computeSimilarities({
      viewer: viewer({ interests: [japanese, thai, baking] }),
      member: facts({ interests: [japanese, baking] }),
      sharedCrews: [],
      interactions: null,
    });
    expect(keys(result)).toEqual(["cuisine", "technique"]);
    expect(result.groups[0]!.entries.map((entry) => entry.label)).toEqual(["Japanese"]);
    expect(result.groups[0]!.entries[0]!.href).toBe("/members?interest=japanese");
    expect(result.count).toBe(2);
  });

  it("shows nothing about how they cook when the member hides it", () => {
    const result = computeSimilarities({
      viewer: viewer({ interests: [japanese], skill: "CONFIDENT", glutenFree: true }),
      member: facts({
        interests: [japanese],
        skill: "CONFIDENT",
        glutenFree: true,
        roadmap: { trackId: "t1", name: "Weeknight Wins" },
        privacy: { showLocation: true, showLinks: true, showInterests: false },
      }),
      sharedCrews: [],
      interactions: null,
    });
    expect(result.count).toBe(0);
  });

  it("is reciprocal: the viewer hiding theirs hides the match too", () => {
    const result = computeSimilarities({
      viewer: viewer({
        interests: [japanese],
        privacy: { showLocation: true, showLinks: true, showInterests: false },
      }),
      member: facts({ interests: [japanese] }),
      sharedCrews: [],
      interactions: null,
    });
    expect(result.count).toBe(0);
  });
});

describe("cooking, gluten-free and roadmap", () => {
  it("names the same skill level", () => {
    const result = computeSimilarities({
      viewer: viewer({ skill: "ADVANCED" }),
      member: facts({ skill: "ADVANCED" }),
      sharedCrews: [],
      interactions: null,
    });
    expect(result.groups[0]!.entries[0]!.label).toBe("You're both advanced cooks");
  });

  it("says gluten-free only when both are, and both show it", () => {
    const both = computeSimilarities({
      viewer: viewer({ glutenFree: true }),
      member: facts({ glutenFree: true }),
      sharedCrews: [],
      interactions: null,
    });
    expect(both.groups.flatMap((group) => group.entries.map((entry) => entry.key))).toContain(
      "gluten-free",
    );

    const onlyOne = computeSimilarities({
      viewer: viewer({ glutenFree: true }),
      member: facts({ glutenFree: false }),
      sharedCrews: [],
      interactions: null,
    });
    expect(onlyOne.count).toBe(0);
  });

  it("does not say gluten-free twice when both also picked the tag", () => {
    const result = computeSimilarities({
      viewer: viewer({ glutenFree: true, interests: [glutenFreeTag] }),
      member: facts({ glutenFree: true, interests: [glutenFreeTag] }),
      sharedCrews: [],
      interactions: null,
    });
    expect(keys(result)).toEqual(["cooking"]);
    expect(result.count).toBe(1);
  });

  it("names a shared roadmap track, and drops that track's crew so it is not said twice", () => {
    const track = { trackId: "t1", name: "Weeknight Wins" };
    const result = computeSimilarities({
      viewer: viewer({ roadmap: track }),
      member: facts({ roadmap: track }),
      sharedCrews: [crew("road", "ROADMAP"), crew("wfpb")],
      interactions: null,
    });
    expect(keys(result)).toEqual(["roadmap", "crews"]);
    expect(result.groups[1]!.entries.map((entry) => entry.key)).toEqual(["crew:wfpb"]);
    expect(result.groups[1]!.entries[0]!.href).toBe("/crews/wfpb");
  });
});

describe("location", () => {
  it("prefers the city, then the region, then the country", () => {
    expect(
      sharedPlace(
        { city: "Austin", region: "Texas", country: "USA" },
        { city: " austin ", region: "Texas", country: "usa" },
      ),
    ).toEqual({ level: "city", name: "austin" });
    expect(
      sharedPlace(
        { city: "Austin", region: "Texas", country: "USA" },
        { city: "Dallas", region: "Texas", country: "USA" },
      ),
    ).toEqual({ level: "region", name: "Texas" });
    expect(
      sharedPlace(
        { city: "Austin", region: "Texas", country: "USA" },
        { city: "Portland", region: "Oregon", country: "USA" },
      ),
    ).toEqual({ level: "country", name: "USA" });
  });

  it("does not match a city name across two countries", () => {
    expect(
      sharedPlace(
        { city: "Portland", region: null, country: "USA" },
        { city: "Portland", region: null, country: "Australia" },
      ),
    ).toBeNull();
  });

  it("needs both members to show their location", () => {
    const hidden = computeSimilarities({
      viewer: viewer({ city: "Austin", country: "USA" }),
      member: facts({
        city: "Austin",
        country: "USA",
        privacy: { showLocation: false, showLinks: true, showInterests: true },
      }),
      sharedCrews: [],
      interactions: null,
    });
    expect(hidden.count).toBe(0);

    const shown = computeSimilarities({
      viewer: viewer({ city: "Austin", country: "USA" }),
      member: facts({ city: "Austin", country: "USA" }),
      sharedCrews: [],
      interactions: null,
    });
    expect(shown.groups[0]!.entries[0]!.label).toBe("You're both in Austin");
  });
});

describe("classes and live classes", () => {
  it("lists only the classes both have taken, linking to each", () => {
    const tofu = { id: "c1", slug: "tofu-101", title: "Tofu 101" };
    const bread = { id: "c2", slug: "bread", title: "Bread" };
    const result = computeSimilarities({
      viewer: viewer({ classes: [tofu, bread] }),
      member: facts({ classes: [tofu] }),
      sharedCrews: [],
      interactions: null,
    });
    expect(result.groups[0]!.entries).toEqual([
      { key: "class:c1", label: "Tofu 101", href: "/learn/tofu-101" },
    ]);
  });

  it("lists live classes both signed up for, newest first", () => {
    const older = { id: "e1", slug: "sept", title: "September", startsAt: new Date("2026-09-01T00:00:00Z") };
    const newer = { id: "e2", slug: "oct", title: "October", startsAt: new Date("2026-10-01T00:00:00Z") };
    const result = computeSimilarities({
      viewer: viewer({ liveClasses: [older, newer] }),
      member: facts({ liveClasses: [older, newer] }),
      sharedCrews: [],
      interactions: null,
    });
    expect(result.groups[0]!.entries.map((entry) => entry.href)).toEqual([
      "/live-classes/oct",
      "/live-classes/sept",
    ]);
  });
});

describe("interaction signals", () => {
  const interactions: InteractionFacts = {
    ...noInteractions,
    viewerFollowsMember: true,
    memberFollowsViewer: true,
    sharedFollowees: [{ handle: "lee", displayName: "Lee" }],
    sharedFolloweeCount: 3,
    memberRepliedToViewer: 2,
    viewerRepliedToMember: 1,
  };

  it("names follows and replies when both members have matching switched on", () => {
    const result = computeSimilarities({
      viewer: viewer(),
      member: facts(),
      sharedCrews: [],
      interactions,
    });
    expect(result.groups[0]!.entries.map((entry) => entry.label)).toEqual([
      "You follow each other",
      "You both follow Lee and 2 others",
      "You've replied to each other's posts",
    ]);
  });

  it("uses none of them when either member switched matching off", () => {
    for (const [mine, theirs] of [
      [false, true],
      [true, false],
    ]) {
      const result = computeSimilarities({
        viewer: viewer({ matchingOptIn: mine }),
        member: facts({ matchingOptIn: theirs }),
        sharedCrews: [],
        interactions,
      });
      expect(result.count).toBe(0);
    }
  });

  it("says who replied to whom when it only went one way", () => {
    const result = computeSimilarities({
      viewer: viewer(),
      member: facts(),
      sharedCrews: [],
      interactions: { ...noInteractions, memberRepliedToViewer: 1 },
    });
    expect(result.groups[0]!.entries[0]!.label).toBe("Priya has replied to your posts");
  });
});

describe("nothing in common", () => {
  it("is an empty panel with a count of zero", () => {
    const result = computeSimilarities({
      viewer: viewer({ interests: [thai], city: "Austin" }),
      member: facts({ interests: [japanese], city: "Oslo" }),
      sharedCrews: [],
      interactions: noInteractions,
    });
    expect(result).toEqual({ groups: [], count: 0, score: 0 });
    expect(similarityReason(result)).toBeNull();
  });
});

describe("ranking and reasons", () => {
  it("scores more in common higher", () => {
    const little = computeSimilarities({
      viewer: viewer({ interests: [japanese] }),
      member: facts({ interests: [japanese] }),
      sharedCrews: [],
      interactions: null,
    });
    const lots = computeSimilarities({
      viewer: viewer({ interests: [japanese, thai], city: "Austin" }),
      member: facts({ interests: [japanese, thai], city: "Austin" }),
      sharedCrews: [crew("gf", "TRAIT")],
      interactions: null,
    });
    expect(lots.score).toBeGreaterThan(little.score);
  });

  it("gives a card one sentence from the strongest lines", () => {
    const result = computeSimilarities({
      viewer: viewer({ interests: [japanese, thai, baking], city: "Austin" }),
      member: facts({ interests: [japanese, thai, baking], city: "Austin" }),
      sharedCrews: [],
      interactions: null,
    });
    expect(similarityReason(result)).toBe(
      "You both picked Japanese and Thai and more; you're both in Austin.",
    );
  });
});
