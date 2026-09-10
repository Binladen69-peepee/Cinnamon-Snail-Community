import { describe, expect, it } from "vitest";
import {
  MAX_GROUP_MEMBERS,
  canCreateGroup,
  canSendDirectMessage,
  conversationMemberKey,
  isConnection,
  isTyping,
  unreadCount,
  type DmRelationship,
  type DmSubject,
} from "@/lib/messages/permissions";
import { autoLink } from "@/lib/messages/format";

const active = (
  id: string,
  dmPreference: DmSubject["dmPreference"] = "EVERYONE",
): DmSubject => ({ userId: id, status: "ACTIVE", dmPreference });

const strangers: DmRelationship = {
  blocked: false,
  priorConversation: false,
  sharedSpaces: 0,
};

describe("direct message permissions", () => {
  it("lets one active member message another who is open to everyone", () => {
    expect(canSendDirectMessage(active("a"), active("b"), strangers)).toEqual({
      allowed: true,
    });
  });

  it("refuses when the recipient has closed direct messages", () => {
    const decision = canSendDirectMessage(
      active("a"),
      active("b", "NOBODY"),
      strangers,
    );
    expect(decision.allowed).toBe(false);
  });

  it("refuses a stranger when the recipient only accepts connections", () => {
    const decision = canSendDirectMessage(
      active("a"),
      active("b", "CONNECTIONS"),
      strangers,
    );
    expect(decision.allowed).toBe(false);
  });

  it("accepts a shared space as a connection", () => {
    const decision = canSendDirectMessage(active("a"), active("b", "CONNECTIONS"), {
      ...strangers,
      sharedSpaces: 1,
    });
    expect(decision.allowed).toBe(true);
  });

  it("accepts a prior conversation as a connection", () => {
    expect(isConnection({ ...strangers, priorConversation: true })).toBe(true);
  });

  it("refuses when either side has blocked the other", () => {
    const decision = canSendDirectMessage(active("a"), active("b"), {
      ...strangers,
      blocked: true,
    });
    expect(decision.allowed).toBe(false);
  });

  it("refuses a suspended sender and an inactive recipient", () => {
    expect(
      canSendDirectMessage(
        { ...active("a"), status: "SUSPENDED" },
        active("b"),
        strangers,
      ).allowed,
    ).toBe(false);
    expect(
      canSendDirectMessage(
        active("a"),
        { ...active("b"), status: "DELETED" },
        strangers,
      ).allowed,
    ).toBe(false);
  });

  it("refuses messaging yourself", () => {
    expect(canSendDirectMessage(active("a"), active("a"), strangers).allowed).toBe(
      false,
    );
  });
});

describe("group conversations", () => {
  it("needs at least two people and caps the size", () => {
    expect(canCreateGroup(1).allowed).toBe(false);
    expect(canCreateGroup(2).allowed).toBe(true);
    expect(canCreateGroup(MAX_GROUP_MEMBERS).allowed).toBe(true);
    expect(canCreateGroup(MAX_GROUP_MEMBERS + 1).allowed).toBe(false);
  });

  it("builds an order-independent key so a 1:1 thread is never duplicated", () => {
    expect(conversationMemberKey(["b", "a"])).toBe(conversationMemberKey(["a", "b"]));
    expect(conversationMemberKey(["a", "a", "b"])).toBe("a:b");
  });
});

describe("unread counts", () => {
  const messages = [
    { createdAt: new Date("2026-09-01T10:00:00Z"), authorId: "other" },
    { createdAt: new Date("2026-09-01T11:00:00Z"), authorId: "me" },
    { createdAt: new Date("2026-09-01T12:00:00Z"), authorId: "other" },
  ];

  it("counts only messages from other people after the last read", () => {
    expect(unreadCount(messages, "me", new Date("2026-09-01T10:30:00Z"))).toBe(1);
  });

  it("counts every incoming message when the thread was never opened", () => {
    expect(unreadCount(messages, "me", null)).toBe(2);
  });

  it("never counts your own messages", () => {
    expect(unreadCount(messages, "other", null)).toBe(1);
  });
});

describe("typing indicator", () => {
  const now = new Date("2026-09-01T12:00:00Z");

  it("is on for a fresh keystroke and off once it goes stale", () => {
    expect(isTyping(new Date("2026-09-01T11:59:58Z"), now)).toBe(true);
    expect(isTyping(new Date("2026-09-01T11:59:50Z"), now)).toBe(false);
    expect(isTyping(null, now)).toBe(false);
  });
});

describe("message link handling", () => {
  it("links http and https urls", () => {
    const parts = autoLink("see https://veganuniversity.test/recipe now");
    expect(parts.map((part) => part.href).filter(Boolean)).toEqual([
      "https://veganuniversity.test/recipe",
    ]);
  });

  it("leaves other schemes as plain text", () => {
    const parts = autoLink("javascript:alert(1) is not a link");
    expect(parts.every((part) => part.href === undefined)).toBe(true);
  });

  it("keeps trailing punctuation out of the link", () => {
    const [, link] = autoLink("go to https://example.com/x, then stop");
    expect(link.href).toBe("https://example.com/x");
  });
});
