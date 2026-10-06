import { describe, expect, it, vi } from "vitest";
import { createEngagementStore } from "@/components/feed/engagement-store";
import { applyReactionChange } from "@/lib/community/reactions";
import {
  commentAnchorId,
  commentHref,
  commentIdFromHash,
  pathToComment,
} from "@/lib/community/comment-anchor";
import { KITCHEN_TABLE_HREF, kitchenTableHref } from "@/lib/community/kitchen-table-links";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";
import { communityFeedWhere } from "@/lib/community/feed";
import { parseReactionMode } from "@/lib/community/engagement";

/**
 * The pure parts of the Kitchen Table (DEC-078): the per-tab pin and reaction
 * state that fixed "saved does not stick", the reaction arithmetic every
 * surface shares, the comment anchors (C4), and the feed's scope.
 */

describe("the engagement store (why pins now stick)", () => {
  it("remembers the reader's pin for every surface showing the post", () => {
    const store = createEngagementStore();
    expect(store.pin("p1")).toBeUndefined();
    store.setPin("p1", true);
    // The card, the lightbox and a reel all read this one value.
    expect(store.pin("p1")?.value).toBe(true);
    expect(store.pin("p2")).toBeUndefined();
  });

  it("tells subscribers, so a card re-renders when the lightbox pins", () => {
    const store = createEngagementStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.setPin("p1", true);
    store.setReaction("p1", "👍");
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    store.setPin("p1", false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rolls back a refused change to what was there before", () => {
    const store = createEngagementStore();
    const made = store.setPin("p1", true);
    store.revertPin("p1", made, undefined);
    // Back to "no override": the server's own value shows again.
    expect(store.pin("p1")).toBeUndefined();
  });

  it("never lets a late refusal undo a newer press", () => {
    // Pin, then unpin before the first request answers. If the first is then
    // refused, the reader's latest intent (unpinned) must survive.
    const store = createEngagementStore();
    const first = store.setPin("p1", true);
    store.setPin("p1", false);
    store.revertPin("p1", first, undefined);
    expect(store.pin("p1")?.value).toBe(false);
  });

  it("keeps reactions apart from pins", () => {
    const store = createEngagementStore();
    const before = store.reaction("p1");
    const made = store.setReaction("p1", "🎉");
    expect(store.reaction("p1")?.value).toBe("🎉");
    store.setReaction("p1", null);
    expect(store.reaction("p1")?.value).toBeNull();
    // A stale rollback of the first press changes nothing.
    store.revertReaction("p1", made, before);
    expect(store.reaction("p1")?.value).toBeNull();
    expect(store.pin("p1")).toBeUndefined();
  });
});

describe("applyReactionChange", () => {
  it("moves one reaction from the old emoji to the new", () => {
    expect(applyReactionChange({ "👍": 3, "🎉": 1 }, "👍", "🎉")).toEqual({
      "👍": 2,
      "🎉": 2,
    });
  });

  it("adds a first reaction and takes one away", () => {
    expect(applyReactionChange({}, null, "👍")).toEqual({ "👍": 1 });
    expect(applyReactionChange({ "👍": 1 }, "👍", null)).toEqual({});
  });

  it("does not count twice when the server already has the change", () => {
    // A fresh render counts the reader's reaction itself; nothing moves.
    const counts = { "👍": 4 };
    expect(applyReactionChange(counts, "👍", "👍")).toBe(counts);
  });

  it("never goes below zero", () => {
    expect(applyReactionChange({ "👍": 0 }, "👍", null)).toEqual({});
  });
});

describe("reaction intent from the client", () => {
  it("reads set and clear, and defaults to the old toggle", () => {
    expect(parseReactionMode("set")).toBe("set");
    expect(parseReactionMode("clear")).toBe("clear");
    expect(parseReactionMode(null)).toBe("toggle");
    expect(parseReactionMode("drop table")).toBe("toggle");
  });
});

describe("comment anchors (C4)", () => {
  it("gives every comment one stable id and one address", () => {
    expect(commentAnchorId("c1")).toBe("comment-c1");
    expect(commentHref("p1", "c1")).toBe("/posts/p1#comment-c1");
  });

  it("reads a comment id out of a fragment, and nothing else", () => {
    expect(commentIdFromHash("#comment-ck12ab")).toBe("ck12ab");
    expect(commentIdFromHash("comment-ck12ab")).toBe("ck12ab");
    expect(commentIdFromHash("#replies")).toBeNull();
    expect(commentIdFromHash("#comment-")).toBeNull();
    expect(commentIdFromHash("#comment-<img src=x>")).toBeNull();
    expect(commentIdFromHash("#comment-%E0%A4%A")).toBeNull();
    expect(commentIdFromHash("")).toBeNull();
    expect(commentIdFromHash(null)).toBeNull();
  });

  it("finds the path a reply needs open to be seen", () => {
    const tree = [
      { id: "a", replies: [] },
      {
        id: "b",
        replies: [
          { id: "b1", replies: [] },
          { id: "b2", replies: [{ id: "b2x", replies: [] }] },
        ],
      },
    ];
    expect(pathToComment(tree, "a")).toEqual(["a"]);
    expect(pathToComment(tree, "b1")).toEqual(["b", "b1"]);
    expect(pathToComment(tree, "b2x")).toEqual(["b", "b2", "b2x"]);
    expect(pathToComment(tree, "missing")).toBeNull();
  });
});

describe("the Kitchen Table's address and scope", () => {
  it("keeps the client-safe address equal to the canonical one", () => {
    expect(KITCHEN_TABLE_HREF).toBe(KITCHEN_TABLE_PATH);
    expect(KITCHEN_TABLE_HREF).toBe("/kitchen-table");
  });

  it("leaves the defaults out of the URL", () => {
    expect(kitchenTableHref()).toBe("/kitchen-table");
    expect(kitchenTableHref({ sort: "active" })).toBe("/kitchen-table");
    expect(kitchenTableHref({ sort: "new" })).toBe("/kitchen-table?sort=new");
    expect(kitchenTableHref({ view: "reels", sort: "top" })).toBe(
      "/kitchen-table?view=reels&sort=top",
    );
  });

  it("reads the general rooms and never an idea", () => {
    expect(communityFeedWhere(["s1", "s2"])).toEqual({
      spaceId: { in: ["s1", "s2"] },
      type: { not: "IDEA" },
    });
  });
});
