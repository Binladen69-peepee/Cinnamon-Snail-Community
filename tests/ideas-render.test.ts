import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * What the board's parts put on the page, rendered to markup.
 *
 * Not a layout test (nothing here can measure a phone), but it holds the
 * things a screen reader and a keyboard depend on: the vote is a real button
 * that says whether it is pressed and what it counts, and a vote that cannot
 * be cast is not a button at all but says why.
 */

vi.mock("@/app/(member)/ideas/actions", () => ({
  toggleIdeaVoteAction: vi.fn(),
  similarIdeasAction: vi.fn(async () => []),
  submitIdeaAction: vi.fn(),
  editIdeaAction: vi.fn(),
  withdrawIdeaAction: vi.fn(),
  reportIdeaAction: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), danger: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { IdeaVoteButton } = await import("@/components/ideas/idea-vote-button");
const { IdeaRow } = await import("@/components/ideas/idea-row");
const { IdeaStatusBadge, IdeaCategoryBadge } = await import("@/components/ideas/idea-badges");
const { IdeasRail } = await import("@/components/ideas/ideas-rail");
const { IdeaForm } = await import("@/components/ideas/idea-form");
const { IDEA_STATUSES, IDEA_STATUS_VALUES } = await import("@/lib/ideas/constants");

const vote = (props: Partial<Parameters<typeof IdeaVoteButton>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(IdeaVoteButton, {
      ideaId: "idea_1",
      title: "Croissants at home",
      score: 12,
      voted: false,
      block: null,
      ...props,
    }),
  );

const sample = {
  id: "idea_1",
  title: "Croissants at home",
  excerpt: "Laminating without a sheeter.",
  score: 12,
  commentCount: 3,
  publishedAt: new Date("2026-10-01T10:00:00Z"),
  category: "CLASS" as const,
  status: "PLANNED" as const,
  author: { handle: "sam", name: "Sam Member", avatarUrl: null },
  voted: true,
  voteBlock: null,
};

describe("the vote", () => {
  it("is a button that says what it does and whether it is pressed", () => {
    const off = vote();
    expect(off).toContain("<button");
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain("Upvote “Croissants at home”. 12 votes.");

    const on = vote({ voted: true });
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain("Remove your upvote from “Croissants at home”");
  });

  it("is not a button when the member cannot vote, and says why", () => {
    const own = vote({ block: "own", voted: true });
    expect(own).not.toContain("<button");
    expect(own).toContain("your vote is already counted");

    const closed = vote({ block: "closed" });
    expect(closed).not.toContain("<button");
    expect(closed).toContain("Voting is closed");

    const merged = vote({ block: "merged" });
    expect(merged).toContain("merged into another one");
  });

  it("writes the word as well as the number on an idea's page", () => {
    expect(vote({ size: "lg", score: 1 })).toContain(">vote<");
    expect(vote({ size: "lg", score: 2 })).toContain(">votes<");
  });
});

describe("a row on the board", () => {
  it("carries the vote, the title, the facts and the way in", () => {
    const html = renderToStaticMarkup(createElement(IdeaRow, { idea: sample }));
    expect(html).toContain('href="/ideas/idea_1"');
    expect(html).toContain("Croissants at home");
    expect(html).toContain("Laminating without a sheeter.");
    expect(html).toContain(">Planned<");
    expect(html).toContain(">Class<");
    expect(html).toContain('href="/members/sam"');
    expect(html).toContain("Sam Member");
    expect(html).toContain('href="/ideas/idea_1#replies"');
    expect(html).toContain('dateTime="2026-10-01T10:00:00.000Z"');
  });
});

describe("badges", () => {
  it("say the status and the kind in words", () => {
    for (const status of IDEA_STATUS_VALUES) {
      const html = renderToStaticMarkup(createElement(IdeaStatusBadge, { status }));
      expect(html).toContain(IDEA_STATUSES[status].label);
    }
    expect(renderToStaticMarkup(createElement(IdeaCategoryBadge, { category: "FEATURE" }))).toContain(
      "Feature",
    );
  });

  it("paint only from the theme's tokens", () => {
    const html = [
      ...IDEA_STATUS_VALUES.map((status) =>
        renderToStaticMarkup(createElement(IdeaStatusBadge, { status })),
      ),
      vote(),
      vote({ voted: true }),
      vote({ block: "closed" }),
      renderToStaticMarkup(createElement(IdeaRow, { idea: sample })),
    ].join("");
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(html).not.toMatch(/\b(?:bg|text)-(?:white|black)\b/);
  });
});

describe("the rail", () => {
  it("lists what is on the way and explains every status", () => {
    const html = renderToStaticMarkup(createElement(IdeasRail, { planned: [sample] }));
    expect(html).toContain("On the way");
    expect(html).toContain('href="/ideas?sort=planned"');
    for (const status of IDEA_STATUS_VALUES) expect(html).toContain(IDEA_STATUSES[status].label);
  });

  it("leaves the planned list out when nothing is planned", () => {
    const html = renderToStaticMarkup(createElement(IdeasRail, { planned: [] }));
    expect(html).not.toContain("On the way");
    expect(html).toContain("How the board works");
  });
});

describe("the form", () => {
  it("labels every field and offers the four kinds as one radio group", () => {
    const html = renderToStaticMarkup(
      createElement(IdeaForm, {
        mode: "create",
        initial: { title: "", body: "", category: null },
        cancelHref: "/ideas",
      }),
    );
    expect(html).toContain(">Title");
    expect(html).toContain("What kind of idea is it?");
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/name="category"/g)).toHaveLength(4);
    expect(html).toContain(">Details");
    expect(html).toContain("Share idea");
    expect(html).toContain('href="/ideas"');
  });

  it("keeps an idea's kind and words when editing", () => {
    const html = renderToStaticMarkup(
      createElement(IdeaForm, {
        mode: "edit",
        ideaId: "idea_1",
        initial: { title: "Croissants at home", body: "With **butter**.", category: "RECIPE" },
        cancelHref: "/ideas/idea_1",
      }),
    );
    expect(html).toContain('value="Croissants at home"');
    expect(html).toMatch(/value="RECIPE"[^>]*checked|checked[^>]*value="RECIPE"/);
    expect(html).toContain("Save changes");
  });
});
