import { describe, expect, it } from "vitest";
import { renderRichText } from "@/lib/content/rich-text";
import {
  bulletinPostContent,
  escapeMarkdown,
  excerpt,
  happeningLabel,
  happeningState,
  placeLabel,
  placeState,
  serviceLabel,
  serviceState,
} from "@/lib/bulletin/post-content";
import { bulletinAnchor, bulletinItemHref, cardState } from "@/lib/bulletin/card";
import { STILL_ON_MS } from "@/lib/bulletin/vocabulary";

/**
 * What a Bulletin Board item says when it is a Kitchen Table post (DEC-078),
 * and when it counts as live. Pure, so no database.
 */

/** The text a reader actually sees: tags gone, entities decoded. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

describe("escapeMarkdown", () => {
  const tricky = [
    "# Not a heading",
    "> not a quote",
    "- not a list",
    "1. not numbered",
    "*not italic* and **not bold** and _not either_",
    "`not code` ~~not struck~~ | not a table",
    "[not a link](javascript:alert(1))",
    "<script>alert(1)</script> <b>not bold</b>",
    "Fish & chips, minus the fish",
    "Book at https://example.test/menu or www.example.test, or write to cook@example.co.uk",
  ];

  it.each(tricky)("renders %j as exactly that text", (text) => {
    const html = renderRichText(escapeMarkdown(text));
    expect(visibleText(html)).toBe(text);
  });

  it("lets no tag or link through", () => {
    const html = renderRichText(escapeMarkdown(tricky.join("\n\n")));
    expect(html).not.toMatch(/<(h\d|blockquote|ul|ol|li|em|strong|code|del|table|a|script|b)\b/i);
  });
});

describe("excerpt", () => {
  it("keeps short text whole and collapses whitespace", () => {
    expect(excerpt("  Bring   a\nfilling.  ", 50)).toBe("Bring a filling.");
  });

  it("cuts long text at a word, with an ellipsis, within the limit", () => {
    const text = "Bring a filling and a story about the best dumpling you ever ate in your life";
    const cut = excerpt(text, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith("…")).toBe(true);
    expect(text.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut).not.toMatch(/\s…$/);
  });
});

describe("bulletinPostContent", () => {
  it("writes a gathering as its title and a summary that names only the city", () => {
    const content = bulletinPostContent({
      kind: "happening",
      title: "  Sunday   dumpling potluck ",
      happeningKind: "potluck",
      city: "Lisbon",
      description: "Bring a filling. We start at seven.",
    });
    expect(content.title).toBe("Sunday dumpling potluck");
    expect(content.plainText).toBe(
      "A potluck in Lisbon, on the Bulletin Board. Bring a filling. We start at seven.",
    );
    expect(visibleText(renderRichText(content.body))).toContain("Bring a filling. We start at seven.");
  });

  it("keeps a member's markup and HTML out of the post", () => {
    const content = bulletinPostContent({
      kind: "happening",
      title: "Tea",
      happeningKind: "tea",
      city: "Leeds",
      description: "# Shout\n\n<img src=x onerror=alert(1)> and [a link](https://example.test)",
    });
    const html = renderRichText(content.body);
    expect(html).not.toMatch(/<(h1|img|a|script)\b/i);
    expect(content.plainText).not.toContain("<img");
  });

  it("writes a service as online when it has no city", () => {
    const content = bulletinPostContent({
      kind: "service",
      title: "Meal prep",
      category: "meal-prep",
      city: null,
      body: "Five lunches, every Sunday.",
    });
    expect(content.plainText).toBe("Meal prep online, on the Bulletin Board. Five lunches, every Sunday.");
  });

  it("writes a place by its kind and city, never its street", () => {
    const content = bulletinPostContent({
      kind: "place",
      name: "Green Fork",
      category: "cafe",
      veganStatus: "fully-vegan",
      city: "Porto",
    });
    expect(content.title).toBe("Green Fork");
    expect(content.plainText).toBe("Fully vegan café in Porto, on the Bulletin Board.");
  });

  it("caps the summary rather than copying a long description", () => {
    const content = bulletinPostContent({
      kind: "service",
      title: "Lessons",
      category: "lessons",
      city: "Lisbon",
      body: "word ".repeat(400),
    });
    expect(content.plainText.length).toBeLessThan(400);
    expect(content.plainText.endsWith("…")).toBe(true);
  });
});

describe("labels and links", () => {
  it("names each kind the way the board does", () => {
    expect(happeningLabel("potluck")).toBe("Potluck");
    expect(happeningLabel("rave")).toBe("Other");
    expect(serviceLabel("catering")).toBe("Catering");
    expect(serviceLabel(null)).toBe("Member service");
    expect(placeLabel("food-truck", "vegan-friendly")).toBe("Vegan-friendly food truck");
  });

  it("links each kind to its own tab and lands on the item", () => {
    expect(bulletinAnchor("place", "p1")).toBe("place-p1");
    expect(bulletinItemHref("happening", "h1")).toBe("/bulletin#happening-h1");
    expect(bulletinItemHref("service", "s1")).toBe("/bulletin?tab=services#service-s1");
    expect(bulletinItemHref("place", "p1")).toBe("/bulletin?tab=places#place-p1");
  });
});

describe("when an item is live", () => {
  const now = new Date("2026-10-06T12:00:00Z");

  it("keeps a gathering live until a few hours after it starts, unless called off", () => {
    const soon = new Date(now.getTime() + 60_000);
    expect(happeningState({ canceledAt: null, startsAt: soon }, now)).toBe("live");
    expect(happeningState({ canceledAt: now, startsAt: soon }, now)).toBe("canceled");
    const justStarted = new Date(now.getTime() - STILL_ON_MS + 60_000);
    expect(happeningState({ canceledAt: null, startsAt: justStarted }, now)).toBe("live");
    const over = new Date(now.getTime() - STILL_ON_MS - 60_000);
    expect(happeningState({ canceledAt: null, startsAt: over }, now)).toBe("past");
  });

  it("lists a service only while approved and its member active", () => {
    expect(serviceState({ status: "approved", ownerActive: true })).toBe("live");
    expect(serviceState({ status: "approved", ownerActive: false })).toBe("unlisted");
    expect(serviceState({ status: "pending", ownerActive: true })).toBe("review");
    expect(serviceState({ status: "rejected", ownerActive: true })).toBe("unlisted");
    expect(serviceState({ status: "withdrawn", ownerActive: true })).toBe("withdrawn");
  });

  it("lists a place only once approved", () => {
    expect(placeState({ status: "approved" })).toBe("live");
    expect(placeState({ status: "rejected" })).toBe("unlisted");
  });

  it("reads a card with no state from its active flag", () => {
    expect(cardState({ active: true })).toBe("live");
    expect(cardState({ active: false })).toBe("unlisted");
    expect(cardState({ active: false, state: "canceled" })).toBe("canceled");
  });
});
