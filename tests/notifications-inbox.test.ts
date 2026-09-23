import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INBOX_FILTERS,
  INBOX_FILTER_LABEL,
  inboxWhere,
  parseInboxFilter,
} from "@/lib/notifications/inbox";

describe("parseInboxFilter", () => {
  it("accepts every tab it advertises", () => {
    for (const filter of INBOX_FILTERS) {
      expect(parseInboxFilter(filter)).toBe(filter);
    }
  });

  it("falls back to all for anything else", () => {
    expect(parseInboxFilter(undefined)).toBe("all");
    expect(parseInboxFilter("")).toBe("all");
    expect(parseInboxFilter("dms")).toBe("all");
    expect(parseInboxFilter(["replies", "events"])).toBe("replies");
  });

  it("offers DEC-028's six tabs, not one per category", () => {
    expect([...INBOX_FILTERS]).toEqual([
      "all",
      "unread",
      "mentions",
      "replies",
      "events",
      "system",
    ]);
    // DMs are the biggest category here and have their own inbox; a DMs tab
    // would be a worse copy of /messages.
    expect(Object.keys(INBOX_FILTER_LABEL)).not.toContain("dms");
  });
});

describe("inboxWhere", () => {
  const me = "user-1";

  it("always scopes to the viewer, on every tab", () => {
    // A tab that forgot this would show one member another's notifications.
    for (const filter of INBOX_FILTERS) {
      expect(inboxWhere(filter, me).userId).toBe(me);
    }
  });

  it("filters all by nothing else", () => {
    expect(inboxWhere("all", me)).toEqual({ userId: me });
  });

  it("reads unread as a null readAt, not a category", () => {
    const where = inboxWhere("unread", me);
    expect(where).toHaveProperty("readAt", null);
    expect(where).not.toHaveProperty("category");
  });

  it("maps each category tab to its enum member", () => {
    expect(inboxWhere("mentions", me)).toHaveProperty("category", "MENTIONS");
    expect(inboxWhere("replies", me)).toHaveProperty("category", "REPLIES");
    expect(inboxWhere("events", me)).toHaveProperty("category", "EVENTS");
    expect(inboxWhere("system", me)).toHaveProperty("category", "SYSTEM");
  });

  it("does not also constrain readAt on a category tab", () => {
    // Mentions means all mentions, read and unread — otherwise the tab is a
    // second unread view and the history is unreachable.
    expect(inboxWhere("mentions", me)).not.toHaveProperty("readAt");
  });
});

describe("DEC-028: reading is an action, never a render", () => {
  /**
   * Comments are stripped first. The rule is that this code must not mark
   * anything read — writing *about* the rule in a doc comment is exactly what
   * these files should be doing, and a check that cannot tell the two apart
   * punishes the explanation.
   */
  const code = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  const page = code("app/(member)/notifications/page.tsx");
  const lib = code("lib/notifications/inbox.ts");

  it("the page never marks anything read", () => {
    // The previous inbox called this during render and destroyed the unread
    // state it existed to show. That is the whole ruling.
    expect(page).not.toContain("markNotificationsRead");
    expect(page).not.toMatch(/readAt:\s*new Date\(\)/);
  });

  it("the loader never writes", () => {
    for (const write of ["update", "create", "delete", "upsert"]) {
      expect(lib).not.toContain(`prisma.notification.${write}`);
    }
  });

  it("both ways of reading live in the actions file", () => {
    const actions = code("app/(member)/notifications/actions.ts");
    expect(actions).toContain("openNotificationAction");
    expect(actions).toContain("markAllReadAction");
    // Opening one must be scoped to the viewer, or a guessed id marks — and
    // discloses the destination of — someone else's notification.
    expect(actions).toMatch(/findFirst\([\s\S]*?userId: session\.user\.id/);
  });
});
