import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * What a member's browser receives for the crew and match surfaces
 * (DEC-078): the match's opener waiting in the composer, a crew chat that
 * reads as the crew's room, and the crew list's actions.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }),
  useSelectedLayoutSegment: () => null,
  usePathname: () => "/messages/abc",
}));
vi.mock("@/app/(member)/messages/actions", () => ({
  sendMessageAction: async () => ({ ok: true }),
  loadOlderMessagesAction: async () => ({ ok: true, messages: [], hasMore: false, previews: [] }),
  blockMemberAction: async () => ({ ok: true }),
  leaveConversationAction: async () => undefined,
}));
vi.mock("@/app/(member)/upload-actions", () => ({
  requestUploadAction: async () => ({ ok: false, error: "not in tests" }),
}));
vi.mock("@/app/(member)/crews/actions", () => ({
  joinCrewAction: async () => undefined,
  leaveCrewAction: async () => undefined,
  openCrewChatAction: async () => undefined,
}));

const { Thread } = await import("@/components/messages/thread");
const { CrewList } = await import("@/components/crews/crew-list");

const base = {
  conversationId: "abc",
  initialMessages: [],
  initialPreviews: [],
  hasMore: false,
  uploadsEnabled: false,
};

describe("the weekly match's direct message", () => {
  it("opens with the suggested message in the composer, ready to edit", () => {
    const html = renderToStaticMarkup(
      createElement(Thread, {
        ...base,
        title: "Sam Lee",
        kind: "direct",
        isGroup: false,
        memberCount: 2,
        others: [
          {
            id: "u2",
            handle: "sam",
            name: "Sam Lee",
            avatarUrl: null,
            lastReadAt: null,
            blockedByViewer: false,
          },
        ],
        draft: { key: "match:m1", body: "Hi Sam! Connect suggested we meet this week." },
      }),
    );
    expect(html).toMatch(/<textarea[^>]*>Hi Sam! Connect suggested we meet this week\.<\/textarea>/);
    expect(html).toContain("Suggested by your weekly match");
    // Nothing went out: the thread itself is still empty.
    expect(html).toContain("No messages yet.");
  });

  it("is an ordinary empty composer without a draft", () => {
    const html = renderToStaticMarkup(
      createElement(Thread, {
        ...base,
        title: "Sam Lee",
        isGroup: false,
        others: [],
      }),
    );
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(html).not.toContain("Suggested by your weekly match");
  });
});

describe("a crew chat", () => {
  const crewThread = (archived = false) =>
    renderToStaticMarkup(
      createElement(Thread, {
        ...base,
        title: "Gluten-Free Gang",
        kind: "crew",
        isGroup: true,
        memberCount: 12,
        crew: { slug: "gluten-free-gang", name: "Gluten-Free Gang", label: "Survey crew", archived },
        others: [],
      }),
    );

  it("names the crew, links to its page and counts its members", () => {
    const html = crewThread();
    expect(html).toContain('href="/crews/gluten-free-gang"');
    expect(html).toContain("Survey crew · 12 members");
    expect(html).toContain("This is the Gluten-Free Gang chat.");
    expect(html).toContain('placeholder="Message Gluten-Free Gang"');
  });

  it("is read-only once the crew is archived", () => {
    const html = crewThread(true);
    expect(html).toContain("This crew has been archived, so its chat is read-only.");
    expect(html).not.toContain("<textarea");
  });
});

describe("the crew list", () => {
  const crew = {
    id: "c1",
    slug: "wfpb-posse",
    name: "WFPB Posse",
    description: "Whole-food, plant-based cooking.",
    kind: "OPTIONAL" as const,
    memberCount: 1,
    joined: null,
    reason: null,
    chatId: null,
  };

  it("offers Join on the crews a member can join", () => {
    const html = renderToStaticMarkup(
      createElement(CrewList, { crews: [crew], variant: "joinable", returnTo: "/crews" }),
    );
    expect(html).toContain('href="/crews/wfpb-posse"');
    expect(html).toContain("1 member");
    expect(html).toContain("Opt-in");
    expect(html).toMatch(/Join<span class="sr-only"> WFPB Posse<\/span>/);
    expect(html).toContain('name="returnTo" value="/crews"');
  });

  it("offers the chat on the member's own crews, with why they are in it", () => {
    const html = renderToStaticMarkup(
      createElement(CrewList, {
        crews: [
          {
            ...crew,
            slug: "cohort-2025-fall",
            name: "Fall 2025 cohort",
            kind: "COHORT" as const,
            memberCount: 14,
            joined: "AUTO" as const,
            reason: "You started Vegan University in fall 2025.",
            chatId: "conv1",
          },
        ],
        variant: "mine",
        returnTo: "/connect",
        showDescription: false,
      }),
    );
    expect(html).toContain("Open chat");
    expect(html).toContain("14 members");
    expect(html).toContain("You started Vegan University in fall 2025.");
    expect(html).toContain("Start season");
    expect(html).not.toContain("Whole-food");
    // An automatic crew follows its rule: there is nothing to leave.
    expect(html).not.toContain(">Leave<");
  });

  it("lets a member leave an opt-in crew from the list", () => {
    const html = renderToStaticMarkup(
      createElement(CrewList, {
        crews: [{ ...crew, joined: "OPT_IN" as const, reason: "You joined this crew." }],
        variant: "mine",
        returnTo: "/connect",
      }),
    );
    expect(html).toContain('Leave<span class="sr-only"> WFPB Posse</span>');
    expect(html).toContain("Crew chat");
  });
});
