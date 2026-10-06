import { describe, expect, it } from "vitest";
import {
  badgeHref,
  challengeHref,
  classHref,
  commentActivityHref,
  crewHref,
  lessonHref,
  liveClassHref,
  mergeActivity,
  postActivity,
  postHref,
  variationHref,
  type ActivityItem,
} from "@/lib/social/activity";
import { commentIdFromHash } from "@/lib/community/comment-anchor";

/**
 * Every row on a profile's activity tab opens the exact place it happened.
 * These are the addresses, checked one by one, and the anchor format the post
 * page reads back (contract C4).
 */

describe("where a post opens", () => {
  it("opens an ordinary post on its own page", () => {
    expect(postHref({ id: "p1", type: "SIMPLE" })).toBe("/posts/p1");
    expect(postHref({ id: "p2", type: "BULLETIN" })).toBe("/posts/p2");
    expect(postHref({ id: "p3", type: "RECIPE" })).toBe("/posts/p3");
  });

  it("opens an idea on the Ideas board, where its votes and status live", () => {
    expect(postHref({ id: "i1", type: "IDEA" })).toBe("/ideas/i1");
  });
});

describe("where a comment opens", () => {
  it("opens on its post, at the comment's anchor (C4)", () => {
    const href = commentActivityHref({ id: "c9", postId: "p1", postType: "QUESTION" });
    expect(href).toBe("/posts/p1#comment-c9");
    // The post page reads the same anchor back.
    expect(commentIdFromHash(href.slice(href.indexOf("#")))).toBe("c9");
  });

  it("opens a reply to an idea on the idea's page, at the same anchor", () => {
    expect(commentActivityHref({ id: "c1", postId: "i1", postType: "IDEA" })).toBe(
      "/ideas/i1#comment-c1",
    );
  });
});

describe("everything else", () => {
  it("opens lessons, classes, live classes, challenges and crews on their pages", () => {
    expect(lessonHref("tofu-101", "pressing")).toBe("/learn/tofu-101/pressing");
    expect(classHref("tofu-101")).toBe("/learn/tofu-101");
    expect(liveClassHref("october-live-class")).toBe("/live-classes/october-live-class");
    expect(challengeHref("spring-greens")).toBe("/challenges/spring-greens");
    expect(crewHref("gluten-free-gang")).toBe("/crews/gluten-free-gang");
  });

  it("opens a recipe variation on the recipe's post, at the variation", () => {
    expect(variationHref("p5", "v2")).toBe("/posts/p5#variation-v2");
  });

  it("opens a badge on its owner's badges tab, scrolled to it", () => {
    expect(badgeHref("priya", "first-cook")).toBe("/members/priya?tab=badges#badge-first-cook");
  });

  it("escapes anything that is not a safe path segment", () => {
    expect(classHref("a b/c")).toBe("/learn/a%20b%2Fc");
    expect(badgeHref("we ird", "x")).toBe("/members/we%20ird?tab=badges#badge-x");
  });
});

describe("activity labels", () => {
  it("names each kind of post", () => {
    expect(postActivity("QUESTION").label).toBe("Asked a question");
    expect(postActivity("IDEA")).toEqual({ kind: "idea", label: "Suggested an idea" });
    expect(postActivity("BULLETIN").kind).toBe("bulletin");
    expect(postActivity("SIMPLE").label).toBe("Posted in the Kitchen Table");
  });

  it("does not claim the Kitchen Table for a class discussion or a live class room", () => {
    expect(postActivity("SIMPLE", "COURSE").label).toBe("Started a class discussion");
    expect(postActivity("SIMPLE", "EVENTS").label).toBe("Posted about a live class");
    expect(postActivity("SIMPLE", "FEED").label).toBe("Posted in the Kitchen Table");
    // An idea is an idea wherever it is filed.
    expect(postActivity("IDEA", "COURSE").kind).toBe("idea");
  });
});

describe("merging", () => {
  const item = (id: string, at: string): ActivityItem => ({
    id,
    kind: "post",
    label: "Posted",
    detail: null,
    href: `/posts/${id}`,
    at: new Date(at),
  });

  it("puts the newest first across kinds, and cuts to the limit", () => {
    const merged = mergeActivity(
      [
        [item("a", "2026-10-01T00:00:00Z"), item("b", "2026-10-03T00:00:00Z")],
        [item("c", "2026-10-02T00:00:00Z")],
      ],
      2,
    );
    expect(merged.map((row) => row.id)).toEqual(["b", "c"]);
  });

  it("breaks ties by id, so the order never shuffles between loads", () => {
    const same = "2026-10-01T00:00:00Z";
    expect(
      mergeActivity([[item("z", same)], [item("m", same)]], 10).map((row) => row.id),
    ).toEqual(["m", "z"]);
  });
});
