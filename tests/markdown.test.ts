import { describe, expect, it } from "vitest";
import { renderMarkdown, toPlainText } from "@/lib/markdown";
import { renderRichText, richTextToPlain } from "@/lib/content/rich-text";

/**
 * The original names still work, and are the same pipeline as the contract's
 * (lib/content/rich-text.ts): lesson bodies, lesson discussions and event posts
 * render exactly as Kitchen Table posts do.
 */
describe("markdown", () => {
  it("renders safe links", () => {
    const html = renderMarkdown("[hello](https://example.com)");
    expect(html).toContain("hello");
    expect(html).toContain("noopener");
  });

  it("strips scripts", () => {
    // Shown as the text that was typed, never as an element.
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script");
    expect(renderMarkdown("**ok**")).toContain("<strong>ok</strong>");
  });

  it("makes plain text", () => {
    expect(toPlainText("**bold** and more")).toBe("bold and more");
  });

  it("is the contract's pipeline under its old name", () => {
    const body = "**Hi** @sam\n\n- one\n- two";
    expect(renderMarkdown(body)).toBe(renderRichText(body));
    expect(toPlainText(body)).toBe(richTextToPlain(body));
  });
});

describe("mentions", () => {
  it("turns a handle into a link to that member", () => {
    expect(renderMarkdown("hi @sam")).toContain('href="/members/sam"');
  });

  it("leaves an email address alone", () => {
    // The character before the @ decides it: a handle follows whitespace or
    // punctuation, an email follows the local part.
    expect(renderMarkdown("write to a@bcd.com")).not.toContain("/members/");
  });

  it("leaves code alone", () => {
    // An @ inside a code sample is part of the sample.
    expect(renderMarkdown("`@sam`")).not.toContain("/members/");
    const fenced = ["```", "@sam", "```"].join("\n");
    expect(renderMarkdown(fenced)).not.toContain("/members/");
  });

  it("does not wrap a mention that is already a link", () => {
    expect(renderMarkdown("[@sam](/members/sam)")).toBe(
      '<p><a href="/members/sam">@sam</a></p>',
    );
  });

  it("lowercases the target but keeps what was typed", () => {
    expect(renderMarkdown("hi @Sam")).toBe('<p>hi <a href="/members/sam">@Sam</a></p>');
  });
});
