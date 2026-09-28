import { describe, expect, it } from "vitest";
import { autoLink, linksIn } from "@/lib/messages/format";
import { parseInternalLink } from "@/lib/messages/link-preview";

/**
 * Links in a message.
 *
 * Two jobs and both are safety ones: only http and https may become an anchor,
 * and only our own host may be unfurled. The second is the whole reason link
 * previews are restricted — resolving an arbitrary URL server-side is a
 * request-forgery primitive, and the check that stops it is a host comparison
 * that has to be right.
 */

describe("autoLink", () => {
  it("links an http and an https URL", () => {
    const parts = autoLink("see https://example.com/thing for more");
    expect(parts.filter((part) => part.href).map((part) => part.href)).toEqual([
      "https://example.com/thing",
    ]);
  });

  it("leaves a javascript: string inert", () => {
    // The reason the pattern is anchored to http(s) rather than to "://".
    const parts = autoLink("javascript:alert(1) is not a link");
    expect(parts.every((part) => !part.href)).toBe(true);
  });

  it("leaves data: and file: alone too", () => {
    for (const hostile of ["data:text/html,<script>", "file:///etc/passwd"]) {
      expect(autoLink(hostile).every((part) => !part.href)).toBe(true);
    }
  });

  it("does not swallow the punctuation that ends the sentence", () => {
    const parts = autoLink("look at https://example.com/a.");
    const link = parts.find((part) => part.href);
    expect(link?.href).toBe("https://example.com/a");
  });

  it("returns the body unchanged when there is nothing to link", () => {
    expect(autoLink("just words").map((part) => part.text)).toEqual(["just words"]);
  });

  it("agrees with linksIn about what a link is", () => {
    // The bubble looks previews up by the strings `linksIn` produces, and the
    // server resolved them from the same function. A disagreement would make
    // previews silently never render.
    const body = "one https://example.com/a, two https://example.com/b.";
    const anchored = autoLink(body)
      .filter((part) => part.href)
      .map((part) => part.href);
    expect(linksIn(body)).toEqual(anchored);
  });
});

describe("parseInternalLink", () => {
  const origin = "https://veganuniversity.test";

  it("recognises the shapes members actually paste", () => {
    expect(parseInternalLink(`${origin}/learn/winter-soups`, origin)).toEqual({
      kind: "class",
      slug: "winter-soups",
    });
    expect(
      parseInternalLink(`${origin}/learn/winter-soups/knife-work`, origin),
    ).toEqual({ kind: "lesson", courseSlug: "winter-soups", lessonSlug: "knife-work" });
    expect(parseInternalLink(`${origin}/calendar/live-cook`, origin)).toEqual({
      kind: "event",
      slug: "live-cook",
    });
    expect(parseInternalLink(`${origin}/posts/abc123`, origin)).toEqual({
      kind: "post",
      id: "abc123",
    });
    expect(parseInternalLink(`${origin}/members/priya`, origin)).toEqual({
      kind: "member",
      handle: "priya",
    });
    expect(parseInternalLink(`${origin}/spaces/kitchen-table`, origin)).toEqual({
      kind: "space",
      slug: "kitchen-table",
    });
  });

  it("accepts a relative path, which is ours by definition", () => {
    expect(parseInternalLink("/members/priya", origin)).toEqual({
      kind: "member",
      handle: "priya",
    });
  });

  it("refuses another host wearing one of our paths", () => {
    // The check that stops the preview resolver being pointed anywhere else.
    expect(
      parseInternalLink("https://evil.example/members/priya", origin),
    ).toBeNull();
    expect(
      parseInternalLink("https://veganuniversity.test.evil.example/members/x", origin),
    ).toBeNull();
  });

  it("refuses a path it has no description for", () => {
    expect(parseInternalLink(`${origin}/`, origin)).toBeNull();
    expect(parseInternalLink(`${origin}/billing`, origin)).toBeNull();
    expect(parseInternalLink(`${origin}/learn`, origin)).toBeNull();
    expect(parseInternalLink(`${origin}/learn/a/b/c`, origin)).toBeNull();
  });

  it("survives something that is not a URL at all", () => {
    expect(parseInternalLink("not a url", origin)).toBeNull();
    expect(parseInternalLink("", origin)).toBeNull();
  });
});
