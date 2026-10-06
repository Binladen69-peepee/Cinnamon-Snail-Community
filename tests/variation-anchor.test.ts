import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { variationAnchorId, variationIdFromHash } from "@/components/feed/variation-anchor";
import { variationHref } from "@/lib/social/activity";

/**
 * Profile activity links a recipe variation to
 * `/posts/<recipePostId>#variation-<id>`; the variations list on that page
 * renders each row with that id and lands on it, highlighted, the way a
 * linked comment is (C4).
 */

const source = readFileSync(
  resolve(process.cwd(), "components/feed/recipe-variations.tsx"),
  "utf8",
);

describe("variation anchors", () => {
  it("are the fragment profile activity links to", () => {
    expect(variationAnchorId("v2")).toBe("variation-v2");
    expect(variationHref("p5", "v2")).toBe(`/posts/p5#${variationAnchorId("v2")}`);
    expect(variationIdFromHash(new URL(variationHref("p5", "cmabc_12-x"), "https://x.test").hash)).toBe(
      "cmabc_12-x",
    );
  });

  it("read the id back from a fragment, with or without the hash", () => {
    expect(variationIdFromHash("#variation-abc123")).toBe("abc123");
    expect(variationIdFromHash("variation-abc123")).toBe("abc123");
    expect(variationIdFromHash("#variation-abc%5F1")).toBe("abc_1");
  });

  it("ignore anything that is not a variation id", () => {
    for (const hash of [
      null,
      undefined,
      "",
      "#",
      "#comment-abc",
      "#variation-",
      "#variation-<script>",
      "#variation-a b",
      "#variation-%E0%A4%A",
      `#variation-${"x".repeat(65)}`,
    ]) {
      expect(variationIdFromHash(hash), String(hash)).toBeNull();
    }
  });
});

describe("the variations list", () => {
  it("renders every row with its anchor id, clear of the sticky header", () => {
    expect(source).toContain("id={variationAnchorId(variation.id)}");
    expect(source).toMatch(/className="[^"]*\bscroll-mt-24\b[^"]*"/);
  });

  it("brings a linked row into view and highlights it, as a linked comment is", () => {
    expect(source).toContain("variationIdFromHash(window.location.hash)");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("element.dataset.focused = \"true\"");
    expect(source).toContain("data-[focused=true]:bg-brand-wash/60");
    expect(source).toContain('window.addEventListener("hashchange", run)');
    // Motion follows the member's setting.
    expect(source).toContain("prefers-reduced-motion: reduce");
  });
});
