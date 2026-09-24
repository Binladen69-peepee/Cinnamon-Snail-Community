import { describe, expect, it } from "vitest";
import { linkMentions, renderMarkdown, toPlainText } from "@/lib/markdown";

describe("markdown", () => {
  it("renders safe links", () => {
    const html = renderMarkdown("[hello](https://example.com)");
    expect(html).toContain("hello");
    expect(html).toContain("noopener");
  });

  it("strips scripts", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("script");
    expect(renderMarkdown("**ok**")).toContain("<strong>ok</strong>");
  });

  it("makes plain text", () => {
    expect(toPlainText("**bold** and more")).toContain("bold");
  });
});

describe("mentions", () => {
  it("turns a handle into a link to that member", () => {
    expect(linkMentions("hey @sam")).toBe("hey [@sam](/members/sam)");
    expect(renderMarkdown("hi @sam")).toContain('href="/members/sam"');
  });

  it("leaves an email address alone", () => {
    // The character before the @ decides it: a handle follows whitespace or
    // punctuation, an email follows the local part.
    expect(linkMentions("write to a@b.com")).toBe("write to a@b.com");
  });

  it("leaves code alone", () => {
    // An @ inside a code sample is part of the sample.
    expect(linkMentions("`@sam`")).toBe("`@sam`");
    const fenced = ["```", "@sam", "```"].join("\n");
    expect(linkMentions(fenced)).toBe(fenced);
  });

  it("does not wrap a mention that is already a link", () => {
    expect(linkMentions("[@sam](/members/sam)")).toBe("[@sam](/members/sam)");
  });

  it("lowercases the target but keeps what was typed", () => {
    expect(linkMentions("hi @Sam")).toBe("hi [@Sam](/members/sam)");
  });
});
