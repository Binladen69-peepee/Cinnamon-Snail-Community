import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Similarity } from "@/lib/social/similarities";

/**
 * The "Show similarities" panel, rendered: collapsed by default, a native
 * disclosure, every line linking where it can, an honest empty state, and
 * nothing at all where there must be no panel.
 */

const loadSimilarities = vi.fn<(viewerId: string, memberId: string) => Promise<Similarity | null>>();

vi.mock("@/lib/social/similarities", () => ({ loadSimilarities }));
vi.mock("@/lib/events/access", () => ({
  getEventViewer: vi.fn(async () => ({ timeZone: "America/New_York" })),
}));

const { SimilaritiesPanel } = await import("@/components/profile/similarities-panel");

async function render(similarity: Similarity | null) {
  loadSimilarities.mockResolvedValueOnce(similarity);
  const element = await SimilaritiesPanel({
    viewerId: "viewer",
    memberId: "member",
    memberName: "Priya Shah",
  });
  return element ? renderToStaticMarkup(element) : "";
}

beforeEach(() => loadSimilarities.mockReset());

describe("the panel", () => {
  it("starts collapsed, as a native disclosure", async () => {
    const html = await render({
      count: 2,
      score: 5,
      groups: [
        {
          key: "cuisine",
          title: "Cuisines",
          display: "chips",
          entries: [{ key: "interest:japanese", label: "Japanese", href: "/members?interest=japanese" }],
        },
        {
          key: "crews",
          title: "Crews you're both in",
          display: "list",
          entries: [{ key: "crew:c1", label: "Gluten-Free Gang", href: "/crews/gluten-free-gang" }],
        },
      ],
    });
    expect(html).toMatch(/^<details(?![^>]*\bopen\b)/);
    expect(html).toContain("<summary");
    expect(html).toContain("Show similarities");
    expect(html).toContain("2 things in common");
    expect(html).toContain('href="/members?interest=japanese"');
    expect(html).toContain('href="/crews/gluten-free-gang"');
    expect(html).toContain('href="/members?view=similar"');
    expect(html).not.toMatch(/\bAI\b/);
  });

  it("dates a live class in the viewer's own time zone", async () => {
    const html = await render({
      count: 1,
      score: 2,
      groups: [
        {
          key: "live-classes",
          title: "Live classes you both signed up for",
          display: "list",
          entries: [
            {
              key: "live:e1",
              label: "Dumplings",
              href: "/live-classes/dumplings",
              // 01:00 UTC on the 2nd is still the 1st in New York.
              date: new Date("2026-10-02T01:00:00Z"),
            },
          ],
        },
      ],
    });
    expect(html).toContain("Oct 1, 2026");
  });

  it("says so when there is nothing in common", async () => {
    const html = await render({ count: 0, score: 0, groups: [] });
    expect(html).toContain("Nothing in common yet");
    expect(html).toContain('href="/settings"');
  });

  it("renders nothing where there must be no panel", async () => {
    expect(await render(null)).toBe("");
  });

  it("never takes the profile down with it", async () => {
    loadSimilarities.mockRejectedValueOnce(new Error("database down"));
    const element = await SimilaritiesPanel({ viewerId: "v", memberId: "m", memberName: "Priya" });
    const html = element ? renderToStaticMarkup(element) : "";
    expect(html).toContain("didn’t load");
  });
});
