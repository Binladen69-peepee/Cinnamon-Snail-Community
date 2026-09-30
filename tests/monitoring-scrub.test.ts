import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { FILTERED, scrubMessage, scrubRecord, scrubUrl } from "@/lib/monitoring/scrub";
import { scrubBreadcrumb, scrubEvent } from "@/lib/monitoring/sentry-options";

describe("scrubUrl", () => {
  it("drops tokens and typed text, keeps navigation state", () => {
    expect(scrubUrl("https://x.test/reset?token=abc&view=reels")).toBe(
      "https://x.test/reset?view=reels",
    );
    expect(scrubUrl("/search?q=my+diagnosis")).toBe("/search");
    expect(scrubUrl("/api/auth/callback/email?email=a%40b.c&token=t")).toBe(
      "/api/auth/callback/email",
    );
    expect(scrubUrl("/home?sort=new")).toBe("/home?sort=new");
  });

  it("leaves non-URLs alone", () => {
    expect(scrubUrl("")).toBe("");
    expect(scrubUrl("http://[bad")).toBe("http://[bad");
  });
});

describe("scrubRecord", () => {
  it("replaces sensitive keys at any depth", () => {
    const out = scrubRecord({
      password: "hunter2",
      nested: { messageBody: "private", cardNumber: "4242", ok: 1 },
      link: "/login?callbackUrl=/x&token=abc",
    });
    expect(out.password).toBe(FILTERED);
    expect(out.nested.messageBody).toBe(FILTERED);
    expect(out.nested.cardNumber).toBe(FILTERED);
    expect(out.nested.ok).toBe(1);
    expect(out.link).toBe("/login");
  });
});

describe("scrubMessage", () => {
  it("keeps only the first line, where Prisma has not quoted data yet", () => {
    expect(
      scrubMessage("Invalid `prisma.message.create()` invocation:\n{ body: 'secret' }"),
    ).toBe("Invalid `prisma.message.create()` invocation:");
  });
});

describe("scrubEvent", () => {
  it("strips request payloads, cookies and every user field but the id", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://x.test/verify?token=abc",
        data: "password=hunter2",
        cookies: { session: "s" },
        query_string: "token=abc",
        headers: { "user-agent": "UA", cookie: "s=1", authorization: "Bearer t" },
      },
      user: { id: "user_1", email: "a@b.c", ip_address: "1.2.3.4" },
      exception: { values: [{ type: "Error", value: "boom\nwith body 'hi'" }] },
    } as ErrorEvent)!;
    expect(event.request?.url).toBe("https://x.test/verify");
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.headers).toEqual({ "user-agent": "UA" });
    expect(event.user).toEqual({ id: "user_1" });
    expect(event.exception?.values?.[0]?.value).toBe("boom");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console output and scrubs navigation URLs", () => {
    expect(scrubBreadcrumb({ category: "console", message: "secret" })).toBeNull();
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/reset?token=a", to: "/home?view=reels" },
    });
    expect(crumb?.data).toEqual({ from: "/reset", to: "/home?view=reels" });
  });
});
