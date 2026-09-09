import { describe, expect, it } from "vitest";
import { hotRank, nestComments, parseFeedSort, sortByFeed } from "@/lib/community/sort";
import { voteDelta } from "@/lib/community/votes";
import { summarizeReactions } from "@/lib/community/facebook-reactions";

describe("feed sort", () => {
  it("parses known sorts and defaults to hot", () => {
    expect(parseFeedSort("top")).toBe("top");
    expect(parseFeedSort("nope")).toBe("hot");
  });

  it("ranks newer high scores hotter than older equal scores", () => {
    const now = new Date("2026-09-09T12:00:00Z");
    const fresh = hotRank(3, new Date("2026-09-09T10:00:00Z"), now);
    const stale = hotRank(3, new Date("2026-09-01T10:00:00Z"), now);
    expect(fresh).toBeGreaterThan(stale);
  });

  it("sorts top by score then recency", () => {
    const items = [
      {
        id: "a",
        score: 2,
        publishedAt: new Date("2026-09-01"),
        createdAt: new Date("2026-09-01"),
        pinnedAt: null,
      },
      {
        id: "b",
        score: 5,
        publishedAt: new Date("2026-08-01"),
        createdAt: new Date("2026-08-01"),
        pinnedAt: null,
      },
    ];
    expect(sortByFeed(items, "top").map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("nests replies under parents", () => {
    const nested = nestComments(
      [
        { id: "root", parentId: null, score: 1, createdAt: new Date("2026-09-01") },
        { id: "child", parentId: "root", score: 4, createdAt: new Date("2026-09-02") },
      ],
      "top",
    );
    expect(nested).toHaveLength(1);
    expect(nested[0]?.replies[0]?.id).toBe("child");
  });
});

describe("voteDelta", () => {
  it("toggles the same vote off and switches direction", () => {
    expect(voteDelta(0, 1)).toEqual({ stored: 1, delta: 1 });
    expect(voteDelta(1, 1)).toEqual({ stored: 0, delta: -1 });
    expect(voteDelta(1, -1)).toEqual({ stored: -1, delta: -2 });
    expect(voteDelta(-1, 1)).toEqual({ stored: 1, delta: 2 });
  });
});

describe("facebook reactions", () => {
  it("counts reactions and records the viewer's choice", () => {
    const summary = summarizeReactions(
      [
        { emoji: "👍", userId: "a" },
        { emoji: "👍", userId: "b" },
        { emoji: "❤️", userId: "c" },
      ],
      "c",
    );
    expect(summary.counts["👍"]).toBe(2);
    expect(summary.myReaction).toBe("❤️");
    expect(summary.total).toBe(3);
  });
});
