import { describe, expect, it } from "vitest";
import {
  COMMENT_SORTS,
  FEED_SORTS,
  nestComments,
  parseCommentSort,
  parseFeedSort,
  TOP_WINDOW_MS,
} from "@/lib/community/sort";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  safeDecodeFeedCursor,
} from "@/lib/community/cursor";
import { voteDelta } from "@/lib/community/votes";
import { summarizeReactions } from "@/lib/community/reactions";

/**
 * The feed's ordering contract.
 *
 * Ranking itself moved into SQL, so what is left to test here is the part that
 * still runs in process: which order a URL asks for, how a page boundary is
 * described, and how a conversation is shaped into a tree.
 */

describe("feed sort", () => {
  it("offers exactly the three orders the product promises", () => {
    expect(FEED_SORTS.map((item) => item.value)).toEqual(["active", "new", "top"]);
  });

  it("parses the orders it offers", () => {
    expect(parseFeedSort("top")).toBe("top");
    expect(parseFeedSort("new")).toBe("new");
    expect(parseFeedSort("active")).toBe("active");
  });

  it("keeps old hot and rising links working", () => {
    // Both meant "what is lively here", which is now called recent activity.
    // A stale bookmark should land somewhere sensible rather than nowhere.
    expect(parseFeedSort("hot")).toBe("active");
    expect(parseFeedSort("rising")).toBe("active");
  });

  it("falls back to recent activity for anything else", () => {
    expect(parseFeedSort("nonsense")).toBe("active");
    expect(parseFeedSort(undefined)).toBe("active");
    expect(parseFeedSort(["top", "new"])).toBe("top");
  });

  it("looks back exactly a week for top", () => {
    expect(TOP_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("comment sort", () => {
  it("is its own set of orders, not the feed's", () => {
    expect(COMMENT_SORTS.map((item) => item.value)).toEqual(["top", "new", "old"]);
    expect(parseCommentSort("old")).toBe("old");
    expect(parseCommentSort("active")).toBe("top");
  });
});

describe("cursors", () => {
  it("round-trips a date cursor", () => {
    const at = new Date("2026-09-09T10:11:12.000Z");
    expect(decodeFeedCursor(encodeFeedCursor(at, "post_1"))).toEqual({
      value: at,
      id: "post_1",
    });
  });

  it("round-trips a score cursor", () => {
    // Top orders by an integer, so the cursor has to carry one without
    // turning it into a date on the way back.
    expect(decodeFeedCursor(encodeFeedCursor(42, "post_2"))).toEqual({
      value: 42,
      id: "post_2",
    });
    expect(decodeFeedCursor(encodeFeedCursor(0, "post_3")).value).toBe(0);
  });

  it("survives an id containing the separator", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    const decoded = decodeFeedCursor(encodeFeedCursor(at, "weird::id"));
    expect(decoded.id).toBe("weird::id");
  });

  it("rejects nonsense", () => {
    expect(() => decodeFeedCursor("nope")).toThrow();
    expect(() => decodeFeedCursor(encodeFeedCursor(new Date(), ""))).toThrow();
  });

  it("treats an unreadable cursor as the start of the feed", () => {
    // Cursors travel in URLs, where they get truncated and mangled. Losing
    // your place is acceptable; an error page instead of the feed is not.
    expect(safeDecodeFeedCursor("garbage")).toBeNull();
    expect(safeDecodeFeedCursor(undefined)).toBeNull();
    expect(safeDecodeFeedCursor(null)).toBeNull();
    expect(safeDecodeFeedCursor(encodeFeedCursor(7, "ok"))).toEqual({
      value: 7,
      id: "ok",
    });
  });
});

describe("nesting a conversation", () => {
  const roots = [
    { id: "r1", parentId: null, score: 1, createdAt: new Date("2026-09-01") },
    { id: "r2", parentId: null, score: 9, createdAt: new Date("2026-09-03") },
  ];

  it("puts replies under their parent", () => {
    const nested = nestComments(
      [
        ...roots,
        { id: "c1", parentId: "r1", score: 4, createdAt: new Date("2026-09-02") },
      ],
      "top",
    );
    expect(nested).toHaveLength(2);
    expect(nested[0]!.id).toBe("r2");
    expect(nested.find((node) => node.id === "r1")!.replies.map((r) => r.id)).toEqual([
      "c1",
    ]);
  });

  it("reads replies in sequence whatever the top-level order is", () => {
    // A conversation shown newest-first is not a conversation.
    const nested = nestComments(
      [
        roots[0]!,
        { id: "late", parentId: "r1", score: 99, createdAt: new Date("2026-09-05") },
        { id: "early", parentId: "r1", score: 0, createdAt: new Date("2026-09-02") },
      ],
      "new",
    );
    expect(nested[0]!.replies.map((reply) => reply.id)).toEqual(["early", "late"]);
  });

  it("promotes an orphan instead of dropping it", () => {
    // Its parent was deleted or is on another page. Losing the reply entirely
    // is worse than showing it at the top level.
    const nested = nestComments(
      [{ id: "lost", parentId: "gone", score: 1, createdAt: new Date("2026-09-04") }],
      "top",
    );
    expect(nested.map((node) => node.id)).toEqual(["lost"]);
  });

  it("orders roots by the chosen sort", () => {
    expect(nestComments(roots, "old").map((node) => node.id)).toEqual(["r1", "r2"]);
    expect(nestComments(roots, "new").map((node) => node.id)).toEqual(["r2", "r1"]);
    expect(nestComments(roots, "top").map((node) => node.id)).toEqual(["r2", "r1"]);
  });
});

describe("vote arithmetic", () => {
  it("is worth one, two, or minus one", () => {
    expect(voteDelta(0, 1)).toEqual({ stored: 1, delta: 1 });
    expect(voteDelta(1, 1)).toEqual({ stored: 0, delta: -1 });
    expect(voteDelta(-1, 1)).toEqual({ stored: 1, delta: 2 });
  });
});

describe("reaction summary", () => {
  it("counts and finds mine", () => {
    const summary = summarizeReactions(
      [
        { emoji: "👍", userId: "a" },
        { emoji: "👍", userId: "b" },
        { emoji: "🔥", userId: "a" },
      ],
      "a",
    );
    expect(summary.counts["👍"]).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.myReaction).not.toBeNull();
  });
});
