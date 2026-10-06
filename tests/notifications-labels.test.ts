import { describe, expect, it } from "vitest";
import { INBOX_FILTERS, INBOX_FILTER_LABEL, inboxWhere } from "@/lib/notifications/inbox";
import { PREF_ROWS } from "@/lib/notifications/preferences";
import { renderNotificationEmail } from "@/lib/notifications/email";

/**
 * What members read about their notifications, after the renames.
 *
 * Events became Live Classes (DEC-079) and spaces left the interface
 * (DEC-078), so neither word is shown any more: not on the inbox tabs, not in
 * the settings table, and not in the "you get these because…" line of an
 * email or on the unsubscribe page, which both print the settings label. The
 * enum values and the `?filter=` key stay as they were, because they are
 * stored and linked, not read.
 */

const row = (category: (typeof PREF_ROWS)[number]["category"]) => {
  const found = PREF_ROWS.find((item) => item.category === category);
  expect(found, category).toBeDefined();
  return found!;
};

describe("the inbox tabs", () => {
  it("call the live class tab Live classes, on the same key and category as before", () => {
    expect(INBOX_FILTER_LABEL.events).toBe("Live classes");
    expect(INBOX_FILTERS).toContain("events");
    expect(inboxWhere("events", "user-1")).toHaveProperty("category", "EVENTS");
  });

  it("never say event or space", () => {
    for (const label of Object.values(INBOX_FILTER_LABEL)) {
      expect(label).not.toMatch(/\b(events?|spaces?)\b/i);
    }
  });
});

describe("the notification settings", () => {
  it("name live class reminders, and say which gatherings share the switch", () => {
    const events = row("EVENTS");
    expect(events.label).toBe("Live class reminders");
    expect(events.hint).toMatch(/live classes/i);
    expect(events.hint).toContain("Bulletin Board");
  });

  it("call community activity Group activity, covering crew chats and community posts", () => {
    const group = row("SPACE_ACTIVITY");
    expect(group.label).toBe("Group activity");
    expect(group.hint).toMatch(/crew chats/i);
    expect(group.hint).toMatch(/community posts/i);
  });

  it("never say event or space to a member", () => {
    for (const item of PREF_ROWS) {
      expect(`${item.label} ${item.hint}`, item.category).not.toMatch(/\b(events?|spaces?)\b/i);
    }
  });
});

describe("an email", () => {
  it("names the switch a member can turn off in the words of the settings page", () => {
    const reminder = renderNotificationEmail({
      userId: "user_1",
      category: "EVENTS",
      title: "Starting soon: Tofu night",
      body: "Join on Zoom from the class page.",
      href: "/live-classes/tofu-night",
    });
    expect(reminder.html).toContain("“Live class reminders”");

    const crew = renderNotificationEmail({
      userId: "user_1",
      category: "SPACE_ACTIVITY",
      title: "New messages in Nooch Newbies",
      body: "Your crew is talking.",
      href: "/messages/abc",
    });
    expect(crew.html).toContain("“Group activity”");
  });
});
