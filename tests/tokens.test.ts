import { describe, expect, it } from "vitest";
import {
  hashMagicToken,
  inspectStoredToken,
  maskEmail,
} from "@/lib/auth/tokens";
import { magicLinkHtml, magicLinkText } from "@/lib/email/templates/magic-link";

describe("magic tokens", () => {
  it("hashes tokens without storing the raw value", () => {
    const hash = hashMagicToken("abc123");
    expect(hash).not.toBe("abc123");
    expect(hash).toBe(hashMagicToken("abc123"));
    expect(hash).not.toBe(hashMagicToken("abc124"));
  });

  it("classifies missing, used, expired, and valid tokens", () => {
    const now = new Date("2026-09-09T10:00:00.000Z");
    expect(inspectStoredToken(null, now)).toBe("invalid");
    expect(
      inspectStoredToken(
        { expires: new Date("2026-09-09T11:00:00.000Z"), usedAt: now },
        now,
      ),
    ).toBe("used");
    expect(
      inspectStoredToken(
        { expires: new Date("2026-09-09T09:00:00.000Z"), usedAt: null },
        now,
      ),
    ).toBe("expired");
    expect(
      inspectStoredToken(
        { expires: new Date("2026-09-09T11:00:00.000Z"), usedAt: null },
        now,
      ),
    ).toBe("valid");
  });

  it("masks emails for logs", () => {
    expect(maskEmail("adam@veganuniversity.test")).toBe(
      "a***@veganuniversity.test",
    );
  });
});

describe("magic-link email", () => {
  const url = "https://example.com/login/verify?email=a@b.com&token=secret";

  it("includes a clear CTA and expiration copy", () => {
    const html = magicLinkHtml(url);
    expect(html).toContain("Sign in to Vegan University");
    expect(html).toContain("https://example.com/login/verify?email=a@b.com&amp;token=secret");
    expect(html).toContain("expires in one hour");
    expect(html).not.toContain("<script>");
  });

  it("provides a plain-text fallback", () => {
    const text = magicLinkText(url);
    expect(text).toContain(url);
    expect(text).toContain("one hour");
    expect(text).toContain("only once");
  });
});
