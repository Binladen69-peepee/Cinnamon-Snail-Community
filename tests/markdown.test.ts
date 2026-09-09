import { describe, expect, it } from "vitest";
import { renderMarkdown, toPlainText } from "@/lib/markdown";

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
