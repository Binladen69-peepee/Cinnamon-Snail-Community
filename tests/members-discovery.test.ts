import { describe, expect, it } from "vitest";
import {
  CLUSTER_VIEWS,
  contributionReason,
  contributionScore,
  hasLocation,
  isClusterView,
  joinedReason,
  resolveMemberView,
} from "@/lib/community/directory";
import { parseProfileTab } from "@/components/profile/profile-tabs";

/**
 * The Members page's views (Discover, the four clusters, the directory) and
 * the words a "Top members" or "New members" card uses.
 */

describe("which view a URL opens", () => {
  it("opens Discover on a bare /members", () => {
    expect(resolveMemberView({}, true)).toBe("discover");
    expect(resolveMemberView({ view: "nonsense" }, true)).toBe("discover");
  });

  it("opens a cluster by name", () => {
    for (const view of CLUSTER_VIEWS) {
      expect(resolveMemberView({ view }, true)).toBe(view);
      expect(isClusterView(view)).toBe(true);
    }
    expect(resolveMemberView({ view: "all" }, true)).toBe("all");
    expect(isClusterView("all")).toBe(false);
  });

  it("keeps every old directory link working: a search or filter means the directory", () => {
    expect(resolveMemberView({ interest: "japanese" }, true)).toBe("all");
    expect(resolveMemberView({ q: "priya", view: "top" }, true)).toBe("all");
    expect(resolveMemberView({ page: "2" }, true)).toBe("all");
    expect(resolveMemberView({ cohort: "2026-09" }, false)).toBe("all");
    // An empty parameter is not a filter.
    expect(resolveMemberView({ q: "  " }, true)).toBe("discover");
  });

  it("never opens Near you for a viewer with no location", () => {
    expect(resolveMemberView({ view: "near" }, false)).toBe("discover");
    expect(resolveMemberView({ view: "near" }, true)).toBe("near");
  });

  it("knows when a viewer has a location", () => {
    expect(hasLocation(null)).toBe(false);
    expect(hasLocation({ city: " ", region: null, country: null })).toBe(false);
    expect(hasLocation({ city: null, region: null, country: "Portugal" })).toBe(true);
  });
});

describe("top members", () => {
  it("weighs a post above a reply, and nothing at all as zero", () => {
    expect(contributionScore(1, 0)).toBeGreaterThan(contributionScore(0, 1));
    expect(contributionScore(0, 0)).toBe(0);
    expect(contributionScore(2, 3)).toBe(12);
  });

  it("describes what someone has been doing in words, never a number", () => {
    for (const [posts, replies] of [
      [3, 0],
      [0, 7],
      [2, 9],
    ] as const) {
      expect(contributionReason(posts, replies)).not.toMatch(/\d/);
    }
    expect(contributionReason(2, 9)).toBe("Posting and replying in the community this month");
  });
});

describe("new members", () => {
  it("says when they joined, the same in every timezone", () => {
    expect(joinedReason(new Date("2026-10-03T23:30:00Z"))).toBe("Joined Oct 3");
  });
});

describe("profile tabs in the URL", () => {
  it("opens the tab a link asks for, and Posts otherwise", () => {
    expect(parseProfileTab("badges")).toBe("badges");
    expect(parseProfileTab(["activity"])).toBe("activity");
    expect(parseProfileTab("ABOUT")).toBe("about");
    expect(parseProfileTab("evil")).toBe("posts");
    expect(parseProfileTab(undefined)).toBe("posts");
  });
});
