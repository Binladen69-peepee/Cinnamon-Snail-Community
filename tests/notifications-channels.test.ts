import { describe, expect, it } from "vitest";
import {
  parsePrefs,
  prefsFromForm,
  PREF_ROWS,
  wants,
  withChannelOff,
} from "@/lib/notifications/preferences";
import { planChannels } from "@/lib/notifications/dispatch";
import { backoffMs, MAX_ATTEMPTS, nextState } from "@/lib/notifications/delivery";
import { unsubscribeToken, verifyUnsubscribe } from "@/lib/notifications/unsubscribe";
import { renderNotificationEmail } from "@/lib/notifications/email";
import { outsideBody, safePath } from "@/lib/notifications/content";
import { parseSubscription } from "@/lib/notifications/push";

describe("preferences", () => {
  it("defaults: in-app on, email only for messages/events, push for the personal ones", () => {
    const prefs = parsePrefs(null);
    expect(wants(prefs, "inApp", "SPACE_ACTIVITY")).toBe(true);
    expect(wants(prefs, "email", "DMS")).toBe(true);
    expect(wants(prefs, "email", "SPACE_ACTIVITY")).toBe(false);
    expect(wants(prefs, "push", "MENTIONS")).toBe(true);
    expect(wants(prefs, "push", "DIGESTS")).toBe(false);
  });

  it("an explicit choice wins, and SYSTEM cannot be switched off", () => {
    const prefs = parsePrefs({ email: { DMS: false, SYSTEM: false }, push: { REPLIES: false } });
    expect(wants(prefs, "email", "DMS")).toBe(false);
    expect(wants(prefs, "email", "SYSTEM")).toBe(true);
    expect(wants(prefs, "push", "REPLIES")).toBe(false);
  });

  it("ignores junk in the stored JSON", () => {
    const prefs = parsePrefs({ email: { NOPE: true, DMS: "yes" }, push: "x" });
    expect(prefs.email).toEqual({});
    expect(prefs.push).toEqual({});
  });

  it("reads the form as an explicit value for every switch", () => {
    const form = new FormData();
    form.set("email:REPLIES", "on");
    form.set("push:DMS", "on");
    const prefs = prefsFromForm(form);
    expect(prefs.email.REPLIES).toBe(true);
    expect(prefs.email.DMS).toBe(false);
    expect(prefs.push.DMS).toBe(true);
    expect(prefs.inApp.MENTIONS).toBe(false);
    expect(Object.keys(prefs.inApp)).toHaveLength(PREF_ROWS.length);
  });

  it("unsubscribing turns off one channel of one category only", () => {
    const next = withChannelOff(parsePrefs(null), "email", "EVENTS");
    expect(wants(next, "email", "EVENTS")).toBe(false);
    expect(wants(next, "email", "DMS")).toBe(true);
    expect(wants(next, "inApp", "EVENTS")).toBe(true);
    expect(withChannelOff(parsePrefs(null), "email", "SYSTEM")).toEqual(parsePrefs(null));
  });
});

describe("planChannels", () => {
  const prefs = parsePrefs(null);
  it("sends email and push only to active members who can receive them", () => {
    expect(planChannels({ category: "DMS", prefs, active: true, hasEmail: true, hasPush: true })).toEqual({
      inApp: true,
      email: true,
      push: true,
    });
    expect(planChannels({ category: "DMS", prefs, active: false, hasEmail: true, hasPush: true })).toEqual({
      inApp: true,
      email: false,
      push: false,
    });
    expect(
      planChannels({ category: "DMS", prefs, active: true, hasEmail: true, hasPush: false }).push,
    ).toBe(false);
  });

  it("keeps email when in-app is muted", () => {
    const muted = parsePrefs({ inApp: { EVENTS: false } });
    expect(
      planChannels({ category: "EVENTS", prefs: muted, active: true, hasEmail: true, hasPush: false }),
    ).toEqual({ inApp: false, email: true, push: false });
  });
});

describe("delivery state machine", () => {
  const now = new Date("2026-10-01T10:00:00Z");

  it("backs off exponentially and caps", () => {
    expect(backoffMs(1)).toBe(2 * 60 * 1000);
    expect(backoffMs(3)).toBe(8 * 60 * 1000);
    expect(backoffMs(30)).toBe(6 * 60 * 60 * 1000);
  });

  it("retries transient failures until the last attempt, then fails", () => {
    const retry = nextState({ status: "RETRY", error: "503" }, 1, now);
    expect(retry.status).toBe("PENDING");
    expect(retry.nextAttemptAt!.getTime()).toBe(now.getTime() + backoffMs(1));
    expect(nextState({ status: "RETRY", error: "503" }, MAX_ATTEMPTS, now).status).toBe("FAILED");
  });

  it("never retries a permanent failure or a skip", () => {
    expect(nextState({ status: "FAILED", error: "422" }, 1, now).status).toBe("FAILED");
    expect(nextState({ status: "SKIPPED", error: "off" }, 1, now).status).toBe("SKIPPED");
    expect(nextState({ status: "SENT" }, 1, now)).toMatchObject({ status: "SENT", sentAt: now });
  });
});

describe("unsubscribe links", () => {
  it("verifies its own token and nothing else", () => {
    const t = unsubscribeToken("user_1", "EVENTS");
    expect(verifyUnsubscribe({ u: "user_1", c: "EVENTS", t })).toEqual({ userId: "user_1", category: "EVENTS" });
    expect(verifyUnsubscribe({ u: "user_2", c: "EVENTS", t })).toBeNull();
    expect(verifyUnsubscribe({ u: "user_1", c: "DMS", t })).toBeNull();
    expect(verifyUnsubscribe({ u: "user_1", c: "NOT_A_CATEGORY", t })).toBeNull();
    expect(verifyUnsubscribe({ u: "user_1", c: "EVENTS", t: t.slice(1) })).toBeNull();
  });
});

describe("what leaves the inbox", () => {
  it("never puts a direct message's text in an email or push", () => {
    expect(outsideBody("DMS", "my private words")).not.toContain("private");
    const email = renderNotificationEmail({
      userId: "user_1",
      category: "DMS",
      title: "Sam sent you a message",
      body: "my private words",
      href: "/messages/abc",
    });
    expect(email.html).not.toContain("private words");
    expect(email.text).not.toContain("private words");
  });

  it("escapes HTML and carries one-click unsubscribe for optional mail", () => {
    const email = renderNotificationEmail({
      userId: "user_1",
      category: "REPLIES",
      title: "<script>x</script>",
      body: "a & b",
      href: "/posts/1",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("a &amp; b");
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.headers["List-Unsubscribe"]).toContain("/api/notifications/unsubscribe?");
  });

  it("has no unsubscribe on account notices", () => {
    const email = renderNotificationEmail({
      userId: "user_1",
      category: "SYSTEM",
      title: "Billing",
      body: "Your payment failed.",
      href: "/billing",
    });
    expect(email.headers).toEqual({});
    expect(email.text).not.toContain("Turn off");
  });

  it("only ever links to same-site paths", () => {
    expect(safePath("https://evil.example")).toBe("/notifications");
    expect(safePath("//evil.example")).toBe("/notifications");
    expect(safePath("/posts/1")).toBe("/posts/1");
  });
});

describe("push subscriptions", () => {
  it("accepts a real https endpoint and rejects anything else", () => {
    const keys = { p256dh: "BNc", auth: "abc" };
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "http://10.0.0.1/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://push.example/x", keys: { p256dh: "", auth: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: 42, keys })).toBeNull();
  });
});
