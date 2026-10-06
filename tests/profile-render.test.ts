import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The profile and the member cards, rendered to markup.
 *
 * Not a layout test, but it holds what the client asked for in a form a
 * screen reader and a keyboard depend on: every activity row is a real link to
 * the exact place, Message appears only when a message would be accepted,
 * progress is shown to the owner alone, and Near you is not offered to a
 * viewer with no location.
 */

vi.mock("@/app/(member)/follow-actions", () => ({ toggleFollowAction: vi.fn() }));
vi.mock("@/components/feed/composer", () => ({ Composer: () => null }));
vi.mock("@/components/feed/post-gallery-modal", () => ({ PostGalleryModal: () => null }));

const { ProfileView } = await import("@/components/profile/profile-view");
const { MemberCard } = await import("@/components/members/member-card");
const { MemberViewTabs } = await import("@/components/members/member-views");
const { buildBadgeShowcase } = await import("@/lib/social/badge-rules");
type MemberProfile = import("@/lib/community/profile").MemberProfile;
type DirectoryMember = import("@/lib/community/directory").DirectoryMember;

const activity = {
  recipesShared: 0,
  repliesToOthers: 3,
  helpfulAnswers: 0,
  coursesCompleted: 0,
  roadmapTopicsCompleted: 0,
  liveClassesAttended: 0,
  ideasPlanned: 0,
  recipeVariations: 0,
  challengesFinished: 0,
  connectionsMade: 0,
  placesReviewed: 0,
  memberSinceDays: 10,
};

function profile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    userId: "u1",
    isOwner: false,
    isHost: false,
    handle: "priya",
    displayName: "Priya Shah",
    avatarUrl: null,
    bio: "Dal every week.",
    headline: null,
    location: "Austin, USA",
    joinedAt: new Date("2025-09-14T00:00:00Z"),
    cookingLately: null,
    skill: "CONFIDENT",
    interests: [{ slug: "japanese", label: "Japanese", kind: "CUISINE" }],
    links: [],
    stats: { posts: 2, lessons: 4, classes: 1, badges: 1, followers: 3, following: 2 },
    viewerIsFollowing: false,
    canMessage: true,
    similaritiesAvailable: true,
    badges: buildBadgeShowcase({
      held: [
        {
          slug: "first-cook",
          name: "First Cook",
          description: "",
          icon: "🍳",
          reason: "Shared a first cook with the community.",
          awardedAt: new Date("2026-09-03T12:00:00Z"),
        },
      ],
      activity: null,
    }),
    activity: [
      {
        id: "comment:c1",
        kind: "comment",
        label: "Replied to Sam",
        detail: "Press the tofu first.",
        href: "/posts/p1#comment-c1",
        at: new Date("2026-10-01T10:00:00Z"),
      },
      {
        id: "post:i1",
        kind: "idea",
        label: "Suggested an idea",
        detail: "A dumpling class",
        href: "/ideas/i1",
        at: new Date("2026-09-30T10:00:00Z"),
      },
      {
        id: "live:r1",
        kind: "live-class",
        label: "RSVP'd to a live class",
        detail: "Dumplings live",
        href: "/live-classes/dumplings-live",
        at: new Date("2026-09-29T10:00:00Z"),
      },
    ],
    classesCompleted: [],
    lessonsCompleted: [],
    posts: [],
    ...overrides,
  };
}

const render = (props: Partial<Parameters<typeof ProfileView>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ProfileView, {
      profile: profile(),
      viewer: { name: "Adam", avatar: null },
      uploadsEnabled: false,
      initialTab: "activity",
      ...props,
    }),
  );

describe("the activity tab", () => {
  it("makes every row a link to the exact place", () => {
    const html = render();
    expect(html).toContain('href="/posts/p1#comment-c1"');
    expect(html).toContain('href="/ideas/i1"');
    expect(html).toContain('href="/live-classes/dumplings-live"');
  });

  it("explains itself when there is nothing yet", () => {
    const html = render({ profile: profile({ activity: [] }) });
    expect(html).toContain("Quiet so far");
  });
});

describe("the header", () => {
  it("offers Message, to the new-message picker, only when it would be accepted", () => {
    expect(render()).toContain('href="/messages/new?to=priya"');
    expect(render({ profile: profile({ canMessage: false }) })).not.toContain("/messages/new");
  });

  it("puts the Show similarities slot under the header", () => {
    const html = render({
      similarities: createElement("details", { "data-test": "similarities" }, "panel"),
    });
    expect(html).toContain('data-test="similarities"');
  });
});

describe("the badges tab", () => {
  it("shows a visitor what was earned, with its date, and no progress", () => {
    const html = render({ initialTab: "badges" });
    expect(html).toContain('id="badge-first-cook"');
    expect(html).toContain("Sep 3, 2026");
    expect(html).not.toContain("In progress");
    expect(html).not.toContain('role="progressbar"');
  });

  it("shows the owner the next rung of each ladder, with progress", () => {
    const html = render({
      initialTab: "badges",
      profile: profile({
        isOwner: true,
        badges: buildBadgeShowcase({ held: [], activity }),
      }),
    });
    expect(html).toContain("In progress");
    expect(html).toContain("3 of 5 replies");
    expect(html).toContain('role="progressbar"');
  });
});

describe("a member card", () => {
  const member: DirectoryMember = {
    handle: "lee",
    displayName: "Lee",
    avatarUrl: null,
    bio: null,
    location: "Seattle, USA",
    interests: [],
    skill: null,
    cookingLately: null,
    isHost: false,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    sharedCrews: 2,
    reason: "Also in Seattle",
    following: false,
    canMessage: true,
  };

  it("offers View profile and Message, and says why the member is listed", () => {
    const html = renderToStaticMarkup(createElement(MemberCard, { member, context: "near" }));
    expect(html).toContain('href="/members/lee"');
    expect(html).toContain('aria-label="View Lee&#x27;s profile"');
    expect(html).toContain('href="/messages/new?to=lee"');
    expect(html).toContain("Also in Seattle");
    expect(html).toContain("2 crews in common");
  });

  it("leaves Message off when the member would not accept one", () => {
    const html = renderToStaticMarkup(
      createElement(MemberCard, { member: { ...member, canMessage: false } }),
    );
    expect(html).not.toContain("/messages/new");
  });
});

describe("the member views", () => {
  it("does not offer Near you to a viewer with no location", () => {
    const without = renderToStaticMarkup(
      createElement(MemberViewTabs, { view: "discover", viewerHasLocation: false }),
    );
    expect(without).not.toContain("view=near");
    expect(without).toContain('href="/members?view=top"');
    const withPlace = renderToStaticMarkup(
      createElement(MemberViewTabs, { view: "near", viewerHasLocation: true }),
    );
    expect(withPlace).toContain('href="/members?view=near"');
    expect(withPlace).toMatch(/aria-current="page"[^>]*>[^]*Near you/);
  });
});
