import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { syncInterests } from "@/lib/community/interest-sync";
import { getIdeasSpaceId, getKitchenTableSpaceId } from "@/lib/community/system-spaces";
import { getMemberProfile } from "@/lib/community/profile";
import { loadDirectory, loadMemberClusters } from "@/lib/community/directory";
import {
  awardBadges,
  ensureBadgeCatalog,
  loadActivity,
  loadBadgeShowcase,
} from "@/lib/social/badges";
import { BADGE_RULES } from "@/lib/social/badge-rules";
import { loadSimilarities } from "@/lib/social/similarities";

/**
 * Profiles against the database: badges awarded from real rows (and only
 * once), "Show similarities" honouring privacy and blocks, activity rows that
 * open the exact place and never a place the viewer cannot see, and the
 * Members page's discovery lists.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it. Email
 * is switched off for this file, so a badge notification never leaves the
 * machine.
 */

delete process.env.RESEND_API_KEY;

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const city = `Testville${stamp}`;
const country = `Testland${stamp}`;

let reachable = true;
const users: Record<string, { id: string; handle: string }> = {};
const ids = {
  privateRoom: "",
  recipe: "",
  recipePost: "",
  privatePost: "",
  removedPost: "",
  idea: "",
  otherQuestion: "",
  blockerPost: "",
  removedOtherPost: "",
  helpful: "",
  onBlocked: "",
  onRemoved: "",
  onIdea: "",
  variation: "",
  event: "",
  eventSlug: "",
  crew: "",
  course: "",
  courseSlug: "",
  product: "",
};

async function makeMember(
  suffix: string,
  profile: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
    skill?: "BEGINNER" | "CONFIDENT" | "ADVANCED";
    glutenFree?: boolean;
    privacy?: Record<string, boolean>;
    directoryVisible?: boolean;
    interests?: string[];
  } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `it-ps-${stamp}-${suffix}@example.test`,
      handle: `itps${stamp}${suffix}`,
      name: `Profile ${suffix}`,
      status: "ACTIVE",
      profile: {
        create: {
          displayName: `Profile ${suffix}`,
          city: profile.city ?? null,
          region: profile.region ?? null,
          country: profile.country ?? null,
          skill: profile.skill ?? null,
          glutenFree: profile.glutenFree ?? null,
          privacy: profile.privacy ?? undefined,
          directoryVisible: profile.directoryVisible ?? true,
        },
      },
    },
    select: { id: true, handle: true, profile: { select: { id: true } } },
  });
  if (profile.interests?.length) {
    const rows = await prisma.interest.findMany({
      where: { slug: { in: profile.interests } },
      select: { id: true },
    });
    await prisma.profileInterest.createMany({
      data: rows.map((row) => ({ profileId: user.profile!.id, interestId: row.id })),
    });
  }
  users[suffix] = { id: user.id, handle: user.handle };
  return user;
}

async function post(input: {
  author: string;
  spaceId: string;
  type?: "SIMPLE" | "QUESTION" | "RECIPE" | "IDEA";
  status?: "PUBLISHED" | "REMOVED";
  recipeId?: string;
}) {
  const body = `A post by ${input.author} ${stamp}`;
  const row = await prisma.post.create({
    data: {
      spaceId: input.spaceId,
      authorId: users[input.author]!.id,
      type: input.type ?? "SIMPLE",
      status: input.status ?? "PUBLISHED",
      body,
      plainText: body,
      publishedAt: new Date(),
      recipeId: input.recipeId ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

async function comment(author: string, postId: string, text: string) {
  const row = await prisma.comment.create({
    data: { postId, authorId: users[author]!.id, body: text, plainText: text },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  await syncInterests();

  const here = { city, country };
  await makeMember("viewer", {
    ...here,
    skill: "CONFIDENT",
    glutenFree: true,
    interests: ["japanese", "fermentation"],
  });
  await makeMember("member", {
    ...here,
    skill: "CONFIDENT",
    glutenFree: true,
    interests: ["japanese", "baking"],
  });
  await makeMember("shy", {
    ...here,
    skill: "CONFIDENT",
    interests: ["japanese"],
    privacy: { showLocation: false, showInterests: false, showLinks: true },
  });
  await makeMember("hidden", { ...here, interests: ["japanese"], directoryVisible: false });
  await makeMember("blocker", { ...here, interests: ["japanese"] });
  await makeMember("other", { city: "Elsewhere", country: "Nowhere" });
  await makeMember("veteran", { city: "Elsewhere", country: "Nowhere" });
  await makeMember("nowhere");

  // The viewer blocked someone; nothing of theirs may reach the viewer.
  await prisma.userBlock.create({
    data: { blockerId: users.viewer!.id, blockedId: users.blocker!.id },
  });

  const table = await getKitchenTableSpaceId();
  const ideasSpace = await getIdeasSpaceId();
  ids.privateRoom = (
    await prisma.space.create({
      data: {
        slug: `it-ps-private-${stamp}`,
        name: "A private room",
        kind: "FEED",
        visibility: "PRIVATE",
        memberships: { create: [{ userId: users.member!.id }] },
      },
      select: { id: true },
    })
  ).id;

  ids.recipe = (
    await prisma.recipe.create({
      data: { slug: `it-ps-recipe-${stamp}`, title: `Miso Soup ${stamp}`, body: "Simmer." },
      select: { id: true },
    })
  ).id;
  ids.recipePost = await post({ author: "member", spaceId: table, type: "RECIPE", recipeId: ids.recipe });
  ids.privatePost = await post({ author: "member", spaceId: ids.privateRoom });
  ids.removedPost = await post({ author: "member", spaceId: table, status: "REMOVED" });
  ids.idea = await post({ author: "member", spaceId: ideasSpace, type: "IDEA" });
  await prisma.ideaDetails.create({ data: { postId: ids.idea, status: "PLANNED", category: "CLASS" } });
  ids.otherQuestion = await post({ author: "other", spaceId: table, type: "QUESTION" });
  ids.blockerPost = await post({ author: "blocker", spaceId: table });
  ids.removedOtherPost = await post({ author: "other", spaceId: table, status: "REMOVED" });
  // A hidden member who posts is still not a "top member".
  await post({ author: "hidden", spaceId: table });

  ids.helpful = await comment("member", ids.otherQuestion, "Press the tofu first.");
  ids.onBlocked = await comment("member", ids.blockerPost, "Lovely.");
  ids.onRemoved = await comment("member", ids.removedOtherPost, "Gone now.");
  ids.onIdea = await comment("member", ids.idea, "Adding detail to my own idea.");
  // Someone found the answer helpful.
  await prisma.reaction.create({
    data: { userId: users.viewer!.id, commentId: ids.helpful, emoji: "👍" },
  });

  ids.variation = (
    await prisma.recipeVariation.create({
      data: {
        recipeId: ids.recipe,
        authorId: users.member!.id,
        authorNote: "Added wakame.",
        status: "approved",
        reviewedAt: new Date(),
      },
      select: { id: true },
    })
  ).id;

  ids.eventSlug = `it-ps-live-${stamp}`;
  ids.event = (
    await prisma.event.create({
      data: {
        slug: ids.eventSlug,
        title: `Dumplings live ${stamp}`,
        startsAt: new Date(Date.now() - 2 * 86_400_000),
        status: "PUBLISHED",
        rsvps: {
          create: [
            { userId: users.viewer!.id, status: "GOING" },
            { userId: users.member!.id, status: "GOING" },
          ],
        },
      },
      select: { id: true },
    })
  ).id;

  ids.crew = (
    await prisma.crew.create({
      data: {
        slug: `it-ps-crew-${stamp}`,
        name: `Test crew ${stamp}`,
        kind: "OPTIONAL",
        members: {
          create: [
            { userId: users.viewer!.id, source: "OPT_IN" },
            { userId: users.member!.id, source: "OPT_IN" },
          ],
        },
      },
      select: { id: true },
    })
  ).id;

  ids.courseSlug = `it-ps-class-${stamp}`;
  ids.course = (
    await prisma.course.create({
      data: { slug: ids.courseSlug, title: `Tofu class ${stamp}`, published: true },
      select: { id: true },
    })
  ).id;
  await prisma.courseProgress.createMany({
    data: [
      { courseId: ids.course, userId: users.member!.id, percent: 100, completedAt: new Date() },
      { courseId: ids.course, userId: users.viewer!.id, percent: 40 },
    ],
  });

  // Follow each other.
  await prisma.follow.createMany({
    data: [
      { followerId: users.viewer!.id, followingId: users.member!.id },
      { followerId: users.member!.id, followingId: users.viewer!.id },
    ],
  });

  // Subscribed since 2020, migrated this week: not "new".
  ids.product = (
    await prisma.product.create({
      data: { slug: `it-ps-product-${stamp}`, name: "Test membership", kind: "MEMBERSHIP" },
      select: { id: true },
    })
  ).id;
  await prisma.subscription.create({
    data: {
      userId: users.veteran!.id,
      productId: ids.product,
      status: "ACTIVE",
      startedAt: new Date("2020-01-15T00:00:00Z"),
    },
  });
});

afterAll(async () => {
  if (reachable) {
    const userIds = Object.values(users).map((user) => user.id);
    await prisma.rateLimitBucket
      .deleteMany({ where: { key: { in: userIds.map((id) => `badge-check:${id}`) } } })
      .catch(() => {});
    await prisma.event.deleteMany({ where: { id: ids.event } }).catch(() => {});
    await prisma.crew.deleteMany({ where: { id: ids.crew } }).catch(() => {});
    // Posts, comments, reactions, badges, notifications, follows, blocks and
    // subscriptions all cascade from the user.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    await prisma.recipe.deleteMany({ where: { id: ids.recipe } }).catch(() => {});
    await prisma.course.deleteMany({ where: { id: ids.course } }).catch(() => {});
    await prisma.space.deleteMany({ where: { id: ids.privateRoom } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: ids.product } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe("badges from real rows", () => {
  it("counts what the member actually did", async () => {
    if (!reachable) return;
    const activity = await loadActivity(users.member!.id);
    expect(activity.recipesShared).toBe(1);
    // Replies on other members' published posts: the question and the
    // blocked member's post, not the removed one and not their own idea.
    expect(activity.repliesToOthers).toBe(2);
    expect(activity.helpfulAnswers).toBe(1);
    expect(activity.ideasPlanned).toBe(1);
    expect(activity.liveClassesAttended).toBe(1);
    expect(activity.coursesCompleted).toBe(1);
    expect(activity.recipeVariations).toBe(1);
  });

  it("awards once however many checks race, and a re-run awards nothing", async () => {
    if (!reachable) return;
    await Promise.all(Array.from({ length: 4 }, () => awardBadges(users.member!.id)));
    const rows = await prisma.memberBadge.findMany({
      where: { userId: users.member!.id },
      select: { badge: { select: { slug: true } } },
    });
    const slugs = rows.map((row) => row.badge.slug).sort();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(
      [
        "bright-idea",
        "first-cook",
        "first-live-class",
        "first-remix",
        "question-answered",
        "track-complete",
      ].sort(),
    );

    const notesBefore = await prisma.notification.count({ where: { userId: users.member!.id } });
    expect(await awardBadges(users.member!.id)).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: users.member!.id } })).toBe(
      notesBefore,
    );
  });

  it("keeps the catalogue in step with the code, and deletes nothing", async () => {
    if (!reachable) return;
    await ensureBadgeCatalog();
    const rows = await prisma.badge.findMany({ select: { slug: true, criteria: true } });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    for (const rule of BADGE_RULES) {
      expect(bySlug.get(rule.slug)?.criteria, rule.slug).toBe(rule.criteria);
    }
    const retired = bySlug.get("gluten-free-wizard");
    if (retired) expect(retired.criteria).toMatch(/retired/i);
  });

  it("never takes back an award, even a retired one, which stays as a legacy badge", async () => {
    if (!reachable) return;
    const legacy = await prisma.badge.upsert({
      where: { slug: "gluten-free-wizard" },
      update: {},
      create: {
        slug: "gluten-free-wizard",
        name: "Gluten-Free Wizard",
        description: "Made gluten-free cooking look easy.",
        criteria: "Retired: no longer awarded.",
      },
    });
    await prisma.memberBadge.create({ data: { badgeId: legacy.id, userId: users.member!.id } });
    await awardBadges(users.member!.id);
    const showcase = await loadBadgeShowcase(users.member!.id, { isOwner: false });
    const wizard = showcase.earned.find((badge) => badge.slug === "gluten-free-wizard");
    expect(wizard?.legacy).toBe(true);
  });

  it("shows the owner progress from real data, and visitors none", async () => {
    if (!reachable) return;
    const own = await loadBadgeShowcase(users.member!.id, { isOwner: true });
    const replies = own.inProgress.find((badge) => badge.family === "replies");
    expect(replies?.progressLabel).toBe("2 of 5 replies");

    const visitor = await loadBadgeShowcase(users.member!.id, { isOwner: false });
    expect(visitor.inProgress).toEqual([]);
    expect(visitor.toStart).toEqual([]);
    expect(visitor.earned.length).toBe(own.earned.length);
  });
});

describe("show similarities", () => {
  it("lists what the two really share", async () => {
    if (!reachable) return;
    const similarity = await loadSimilarities(users.viewer!.id, users.member!.id);
    expect(similarity).not.toBeNull();
    const byKey = new Map(similarity!.groups.map((group) => [group.key, group]));
    expect(byKey.get("cuisine")?.entries.map((entry) => entry.label)).toEqual(["Japanese"]);
    expect(byKey.get("cooking")?.entries.map((entry) => entry.key).sort()).toEqual([
      "gluten-free",
      "skill",
    ]);
    expect(byKey.get("location")?.entries[0]?.label).toBe(`You're both in ${city}`);
    expect(byKey.get("crews")?.entries[0]?.href).toBe(`/crews/it-ps-crew-${stamp}`);
    expect(byKey.get("classes")?.entries[0]?.href).toBe(`/learn/${ids.courseSlug}`);
    expect(byKey.get("live-classes")?.entries[0]?.href).toBe(`/live-classes/${ids.eventSlug}`);
    expect(byKey.get("connections")?.entries.map((entry) => entry.label)).toContain(
      "You follow each other",
    );
  });

  it("shows nothing a member hid", async () => {
    if (!reachable) return;
    // Same city and the same tag, but both are switched off on their profile.
    const similarity = await loadSimilarities(users.viewer!.id, users.shy!.id);
    expect(similarity).not.toBeNull();
    expect(similarity!.count).toBe(0);
  });

  it("drops the interaction lines when either member turns matching off", async () => {
    if (!reachable) return;
    await prisma.profile.update({
      where: { userId: users.member!.id },
      data: { matchingOptIn: false },
    });
    try {
      const similarity = await loadSimilarities(users.viewer!.id, users.member!.id);
      expect(similarity!.groups.some((group) => group.key === "connections")).toBe(false);
    } finally {
      await prisma.profile.update({
        where: { userId: users.member!.id },
        data: { matchingOptIn: true },
      });
    }
  });

  it("has no panel across a block, in either direction", async () => {
    if (!reachable) return;
    expect(await loadSimilarities(users.viewer!.id, users.blocker!.id)).toBeNull();
    expect(await loadSimilarities(users.blocker!.id, users.viewer!.id)).toBeNull();
  });

  it("has no panel for a member who left the directory, or for yourself", async () => {
    if (!reachable) return;
    expect(await loadSimilarities(users.viewer!.id, users.hidden!.id)).toBeNull();
    expect(await loadSimilarities(users.viewer!.id, users.viewer!.id)).toBeNull();
  });
});

describe("activity", () => {
  it("links every row to the exact place, and only places the viewer may open", async () => {
    if (!reachable) return;
    const profile = await getMemberProfile(users.viewer!.id, users.member!.handle);
    expect(profile).not.toBeNull();
    const hrefs = profile!.activity.map((item) => item.href);

    expect(hrefs).toContain(`/posts/${ids.recipePost}`);
    expect(hrefs).toContain(`/ideas/${ids.idea}`);
    expect(hrefs).toContain(`/posts/${ids.otherQuestion}#comment-${ids.helpful}`);
    expect(hrefs).toContain(`/ideas/${ids.idea}#comment-${ids.onIdea}`);
    expect(hrefs).toContain(`/posts/${ids.recipePost}#variation-${ids.variation}`);
    expect(hrefs).toContain(`/live-classes/${ids.eventSlug}`);
    expect(hrefs).toContain(`/learn/${ids.courseSlug}`);
    expect(hrefs.some((href) => href.startsWith(`/members/${users.member!.handle}?tab=badges#badge-`))).toBe(
      true,
    );

    const all = hrefs.join(" ");
    // A private room the viewer is not in, a removed post, a reply on a
    // removed post, and a reply in a thread by someone the viewer blocked.
    expect(all).not.toContain(ids.privatePost);
    expect(all).not.toContain(ids.removedPost);
    expect(all).not.toContain(ids.onRemoved);
    expect(all).not.toContain(ids.onBlocked);
  });

  it("shows the member their own post in a room they are in", async () => {
    if (!reachable) return;
    const own = await getMemberProfile(users.member!.id, users.member!.handle);
    expect(own!.activity.map((item) => item.href)).toContain(`/posts/${ids.privatePost}`);
    // …and the grid links an idea to the Ideas board.
    expect(own!.posts.find((item) => item.id === ids.idea)?.href).toBe(`/ideas/${ids.idea}`);
  });

  it("has no profile at all across a block", async () => {
    if (!reachable) return;
    expect(await getMemberProfile(users.viewer!.id, users.blocker!.handle)).toBeNull();
  });

  it("offers Show similarities only where a panel may exist", async () => {
    if (!reachable) return;
    expect((await getMemberProfile(users.viewer!.id, users.member!.handle))!.similaritiesAvailable).toBe(
      true,
    );
    expect((await getMemberProfile(users.viewer!.id, users.hidden!.handle))!.similaritiesAvailable).toBe(
      false,
    );
    expect((await getMemberProfile(users.member!.id, users.member!.handle))!.similaritiesAvailable).toBe(
      false,
    );
  });
});

describe("discovery clusters", () => {
  const handles = (members: { handle: string }[] | undefined) =>
    (members ?? []).map((member) => member.handle);

  it("finds members near you, never one who hides their city, hid from the directory, or is blocked", async () => {
    if (!reachable) return;
    const data = await loadMemberClusters({ viewerId: users.viewer!.id, views: ["near"], limit: 500 });
    expect(data.viewerHasLocation).toBe(true);
    const near = data.clusters.near;
    expect(near?.ok).toBe(true);
    const list = near?.ok ? near.members : [];
    expect(handles(list)).toContain(users.member!.handle);
    expect(handles(list)).not.toContain(users.shy!.handle);
    expect(handles(list)).not.toContain(users.hidden!.handle);
    expect(handles(list)).not.toContain(users.blocker!.handle);
    expect(list.find((member) => member.handle === users.member!.handle)?.reason).toBe(
      `Also in ${city}`,
    );
  });

  it("skips Near you for a viewer with no location", async () => {
    if (!reachable) return;
    const data = await loadMemberClusters({ viewerId: users.nowhere!.id, views: ["near"], limit: 10 });
    expect(data.viewerHasLocation).toBe(false);
    expect(data.clusters.near).toBeUndefined();
  });

  it("ranks Similar to you by what is really shared, with a reason, and honours privacy and blocks", async () => {
    if (!reachable) return;
    const data = await loadMemberClusters({ viewerId: users.viewer!.id, views: ["similar"], limit: 500 });
    const similar = data.clusters.similar;
    const list = similar?.ok ? similar.members : [];
    const member = list.find((card) => card.handle === users.member!.handle);
    expect(member?.reason).toMatch(/Japanese/);
    expect(member?.sharedCrews).toBe(1);
    expect(member?.canMessage).toBe(true);
    expect(handles(list)).not.toContain(users.shy!.handle);
    expect(handles(list)).not.toContain(users.hidden!.handle);
    expect(handles(list)).not.toContain(users.blocker!.handle);
  });

  it("lists new members, but not a long-time subscriber migrated this week", async () => {
    if (!reachable) return;
    const data = await loadMemberClusters({ viewerId: users.viewer!.id, views: ["new"], limit: 500 });
    const list = data.clusters.new?.ok ? data.clusters.new.members : [];
    expect(handles(list)).toContain(users.member!.handle);
    expect(handles(list)).not.toContain(users.veteran!.handle);
    expect(handles(list)).not.toContain(users.hidden!.handle);
  });

  it("lists the most active members, never one hidden from the directory", async () => {
    if (!reachable) return;
    const data = await loadMemberClusters({ viewerId: users.viewer!.id, views: ["top"], limit: 500 });
    const list = data.clusters.top?.ok ? data.clusters.top.members : [];
    const member = list.find((card) => card.handle === users.member!.handle);
    expect(member?.reason).toBe("Posting and replying in the community this month");
    expect(handles(list)).not.toContain(users.hidden!.handle);
    expect(handles(list)).not.toContain(users.blocker!.handle);
  });

  it("pins the most similar members at the head of the suggested directory", async () => {
    if (!reachable) return;
    const data = await loadDirectory({
      viewerId: users.viewer!.id,
      q: "",
      sort: "suggested",
      page: 1,
      location: null,
      interest: null,
      skill: null,
      cohort: null,
      space: null,
    });
    const member = data.members.find((card) => card.handle === users.member!.handle);
    expect(member?.reason).toBeTruthy();
    expect(handles(data.members)).not.toContain(users.blocker!.handle);
  });
});
