import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { loadDirectory } from "@/lib/community/directory";
import { getMemberProfile } from "@/lib/community/profile";
import {
  filterHiddenMembers,
  getMemberVisibility,
} from "@/lib/community/member-visibility";
import { syncInterests } from "@/lib/community/interest-sync";

/**
 * The directory and the profile, against the database.
 *
 * The properties here are the ones that only exist once there are rows: that
 * the interest filter is a join rather than a scan over the page, that the
 * facets count what a filter would actually return, and — the important
 * ones — that a member who hides is hidden everywhere rather than only on the
 * page that has the switch.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */
const prisma = new PrismaClient();

let reachable = true;
let viewerId = "";
let hiddenId = "";
let blockedId = "";
let visibleId = "";
const madeIds: string[] = [];
const stamp = Date.now().toString(36);

async function makeMember(input: {
  suffix: string;
  city?: string;
  country?: string;
  skill?: "BEGINNER" | "CONFIDENT" | "ADVANCED";
  directoryVisible?: boolean;
  privacy?: Record<string, boolean>;
  interests?: string[];
}) {
  const user = await prisma.user.create({
    data: {
      email: `it-dir-${stamp}-${input.suffix}@example.test`,
      handle: `itdir${stamp}${input.suffix}`,
      name: `Directory ${input.suffix}`,
      status: "ACTIVE",
      profile: {
        create: {
          displayName: `Directory ${input.suffix}`,
          city: input.city ?? null,
          country: input.country ?? null,
          skill: input.skill ?? null,
          directoryVisible: input.directoryVisible ?? true,
          privacy: input.privacy ?? undefined,
        },
      },
    },
    select: { id: true, handle: true, profile: { select: { id: true } } },
  });
  madeIds.push(user.id);

  if (input.interests?.length) {
    const rows = await prisma.interest.findMany({
      where: { slug: { in: input.interests } },
      select: { id: true },
    });
    await prisma.profileInterest.createMany({
      data: rows.map((row) => ({
        profileId: user.profile!.id,
        interestId: row.id,
      })),
      skipDuplicates: true,
    });
  }
  return user;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  await syncInterests();

  const viewer = await makeMember({ suffix: "viewer" });
  viewerId = viewer.id;

  const visible = await makeMember({
    suffix: "visible",
    city: "Lisbon",
    country: "Portugal",
    skill: "ADVANCED",
    interests: ["japanese", "fermentation"],
  });
  visibleId = visible.id;

  const hidden = await makeMember({
    suffix: "hidden",
    city: "Lisbon",
    country: "Portugal",
    skill: "ADVANCED",
    directoryVisible: false,
    interests: ["japanese"],
  });
  hiddenId = hidden.id;

  const blocker = await makeMember({
    suffix: "blocked",
    city: "Lisbon",
    country: "Portugal",
    interests: ["japanese"],
  });
  blockedId = blocker.id;
  await prisma.userBlock.create({
    data: { blockerId: blocker.id, blockedId: viewerId },
  });

  // Somebody who keeps their location and interests to themselves.
  await makeMember({
    suffix: "private",
    city: "Oslo",
    country: "Norway",
    skill: "BEGINNER",
    privacy: { showLocation: false, showInterests: false, showLinks: false },
    interests: ["baking"],
  });

  // The member index rows the search filter is checked against.
  for (const id of madeIds) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { handle: true, name: true },
    });
    await prisma.searchIndex.upsert({
      where: {
        entityType_entityId: { entityType: "member", entityId: user.handle },
      },
      update: { title: user.name ?? user.handle, body: "" },
      create: {
        entityType: "member",
        entityId: user.handle,
        title: user.name ?? user.handle,
        body: "",
      },
    });
  }
});

afterAll(async () => {
  if (reachable) {
    const handles = await prisma.user.findMany({
      where: { id: { in: madeIds } },
      select: { handle: true },
    });
    await prisma.searchIndex
      .deleteMany({
        where: {
          entityType: "member",
          entityId: { in: handles.map((row) => row.handle) },
        },
      })
      .catch(() => {});
    // Profiles, interests and blocks all cascade from the user.
    await prisma.user.deleteMany({ where: { id: { in: madeIds } } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.rateLimitBucket
    .deleteMany({ where: { key: { startsWith: "follow:" } } })
    .catch(() => {});
});

const base = () => ({
  viewerId,
  q: "",
  sort: "name" as const,
  page: 1,
  location: null,
  interest: null,
  skill: null,
  cohort: null,
  space: null,
});

describe("who appears", () => {
  it("leaves out a member who hid from the directory", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    const handles = data.members.map((member) => member.handle);
    expect(handles).not.toContain(`itdir${stamp}hidden`);
    expect(handles).toContain(`itdir${stamp}visible`);
  });

  it("leaves out a member who blocked the viewer", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    expect(data.members.map((m) => m.handle)).not.toContain(
      `itdir${stamp}blocked`,
    );
  });

  it("never lists the viewer themselves", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    expect(data.members.map((m) => m.handle)).not.toContain(
      `itdir${stamp}viewer`,
    );
  });
});

describe("privacy on a card", () => {
  it("withholds the location of somebody who hid it", async () => {
    if (!reachable) return;
    const data = await loadDirectory({ ...base(), q: `Directory ${stamp}` });
    const all = await loadDirectory(base());
    const shy = all.members.find((m) => m.handle === `itdir${stamp}private`);
    expect(shy).toBeDefined();
    expect(shy?.location).toBeNull();
    expect(shy?.interests).toEqual([]);
    expect(shy?.skill).toBeNull();
    void data;
  });

  it("shows them for somebody who did not hide them", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    const open = data.members.find((m) => m.handle === `itdir${stamp}visible`);
    expect(open?.location).toBe("Lisbon, Portugal");
    expect(open?.skill).toBe("ADVANCED");
    expect(open?.interests.map((i) => i.slug).sort()).toEqual([
      "fermentation",
      "japanese",
    ]);
  });
});

describe("filtering in SQL", () => {
  it("filters by interest against the join table, not the page", async () => {
    if (!reachable) return;
    const data = await loadDirectory({ ...base(), interest: "fermentation" });
    expect(data.members.map((m) => m.handle)).toContain(
      `itdir${stamp}visible`,
    );
    // `total` comes from a COUNT with the same predicate. If the filter were
    // still running over the page this would be the unfiltered count.
    expect(data.total).toBe(data.members.length);
  });

  it("does not surface a hidden member through an interest filter", async () => {
    if (!reachable) return;
    // The hidden member also picked "japanese".
    const data = await loadDirectory({ ...base(), interest: "japanese" });
    const handles = data.members.map((m) => m.handle);
    expect(handles).toContain(`itdir${stamp}visible`);
    expect(handles).not.toContain(`itdir${stamp}hidden`);
    expect(handles).not.toContain(`itdir${stamp}blocked`);
  });

  it("filters by skill", async () => {
    if (!reachable) return;
    const data = await loadDirectory({ ...base(), skill: "ADVANCED" });
    for (const member of data.members) {
      expect(member.skill === "ADVANCED" || member.skill === null).toBe(true);
    }
    expect(data.members.map((m) => m.handle)).toContain(
      `itdir${stamp}visible`,
    );
  });

  it("ignores a skill value that is not one of the three", async () => {
    if (!reachable) return;
    // Asserted on the parsed filter and on what comes back, not by comparing
    // two counts: the suites run in parallel and other files create members,
    // so two totals taken a moment apart are legitimately different.
    const bogus = await loadDirectory({ ...base(), skill: "'; DROP TABLE --" });
    expect(bogus.active.skill).toBeNull();
    // An unparseable value filters nothing, so members of every skill remain.
    const skills = new Set(bogus.members.map((member) => member.skill));
    expect(skills.size).toBeGreaterThan(1);
    expect(bogus.members.map((m) => m.handle)).toContain(
      `itdir${stamp}visible`,
    );
  });

  it("filters by location", async () => {
    if (!reachable) return;
    const data = await loadDirectory({ ...base(), location: "Lisbon, Portugal" });
    for (const member of data.members) {
      expect(member.location).toBe("Lisbon, Portugal");
    }
  });

  it("searches name and handle", async () => {
    if (!reachable) return;
    const data = await loadDirectory({ ...base(), q: "Directory visible" });
    expect(data.members.map((m) => m.handle)).toContain(
      `itdir${stamp}visible`,
    );
  });
});

describe("facets", () => {
  it("counts interests from the join table rather than returning nothing", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    // This list was hardcoded empty before interests were rows.
    expect(data.facets.interests.length).toBeGreaterThan(0);
    const japanese = data.facets.interests.find((f) => f.value === "japanese");
    expect(japanese?.count).toBeGreaterThan(0);
  });

  it("counts only members the viewer can see", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    const japanese = data.facets.interests.find((f) => f.value === "japanese");
    const filtered = await loadDirectory({ ...base(), interest: "japanese" });
    // The promise a facet makes: its number is what the filter returns.
    expect(japanese?.count).toBe(filtered.total);
  });

  it("offers skills and cohorts that actually occur", async () => {
    if (!reachable) return;
    const data = await loadDirectory(base());
    for (const facet of data.facets.skills) {
      expect(facet.count).toBeGreaterThan(0);
    }
    for (const facet of data.facets.cohorts) {
      expect(facet.value).toMatch(/^\d{4}-\d{2}$/);
      expect(facet.count).toBeGreaterThan(0);
    }
  });
});

describe("pagination", () => {
  it("never shows the same member on two pages", async () => {
    if (!reachable) return;
    const first = await loadDirectory({ ...base(), page: 1 });
    if (first.pageCount < 2) return;
    const second = await loadDirectory({ ...base(), page: 2 });
    const overlap = second.members.filter((member) =>
      first.members.some((other) => other.handle === member.handle),
    );
    expect(overlap).toEqual([]);
  });

  it("clamps a page beyond the end rather than erroring", async () => {
    if (!reachable) return;
    const data = await loadDirectory({ ...base(), page: 9999 });
    expect(data.page).toBe(data.pageCount);
  });
});

describe("search visibility", () => {
  it("drops hidden and blocked members from search results", async () => {
    if (!reachable) return;
    const visibility = await getMemberVisibility(viewerId);
    const rows = [
      { entityType: "member", entityId: `itdir${stamp}visible` },
      { entityType: "member", entityId: `itdir${stamp}hidden` },
      { entityType: "member", entityId: `itdir${stamp}blocked` },
      { entityType: "post", entityId: "a-post" },
    ];
    const kept = filterHiddenMembers(rows, visibility).map((r) => r.entityId);
    expect(kept).toContain(`itdir${stamp}visible`);
    expect(kept).not.toContain(`itdir${stamp}hidden`);
    expect(kept).not.toContain(`itdir${stamp}blocked`);
    // A post is not a member and is never touched by this filter.
    expect(kept).toContain("a-post");
  });

  it("never hides a member from themselves", async () => {
    if (!reachable) return;
    await prisma.profile.update({
      where: { userId: viewerId },
      data: { directoryVisible: false },
    });
    try {
      const visibility = await getMemberVisibility(viewerId);
      expect(visibility.hiddenIds.has(viewerId)).toBe(false);
    } finally {
      await prisma.profile.update({
        where: { userId: viewerId },
        data: { directoryVisible: true },
      });
    }
  });
});

describe("the profile page", () => {
  it("is still reachable for a member who left the directory", async () => {
    if (!reachable) return;
    // Hiding is about being found, not about being unreachable: a member who
    // hands somebody their own link should not find it broken.
    const profile = await getMemberProfile(viewerId, `itdir${stamp}hidden`);
    expect(profile).not.toBeNull();
  });

  it("is not reachable across a block, in either direction", async () => {
    if (!reachable) return;
    expect(
      await getMemberProfile(viewerId, `itdir${stamp}blocked`),
    ).toBeNull();
    expect(await getMemberProfile(blockedId, `itdir${stamp}viewer`)).toBeNull();
  });

  it("honours the field switches for a visitor and not for the owner", async () => {
    if (!reachable) return;
    const asVisitor = await getMemberProfile(viewerId, `itdir${stamp}private`);
    expect(asVisitor?.location).toBeNull();
    expect(asVisitor?.interests).toEqual([]);

    const shy = await prisma.user.findFirstOrThrow({
      where: { handle: `itdir${stamp}private` },
      select: { id: true },
    });
    const asOwner = await getMemberProfile(shy.id, `itdir${stamp}private`);
    expect(asOwner?.location).toBe("Oslo, Norway");
    expect(asOwner?.interests.map((i) => i.slug)).toEqual(["baking"]);
  });

  it("carries the curated labels rather than raw strings", async () => {
    if (!reachable) return;
    const profile = await getMemberProfile(viewerId, `itdir${stamp}visible`);
    const japanese = profile?.interests.find((i) => i.slug === "japanese");
    expect(japanese?.label).toBe("Japanese");
    expect(japanese?.kind).toBe("CUISINE");
  });
});

describe("following", () => {
  it("is one row however many times it is asked for", async () => {
    if (!reachable) return;
    // The unique index is what makes this safe; the action tolerates the
    // conflict rather than reading first and racing.
    await Promise.all(
      Array.from({ length: 6 }, () =>
        prisma.follow
          .create({ data: { followerId: viewerId, followingId: visibleId } })
          .catch(() => null),
      ),
    );
    expect(
      await prisma.follow.count({
        where: { followerId: viewerId, followingId: visibleId },
      }),
    ).toBe(1);

    await prisma.follow.deleteMany({
      where: { followerId: viewerId, followingId: visibleId },
    });
  });

  it("survives concurrent unfollows without erroring", async () => {
    if (!reachable) return;
    await prisma.follow.create({
      data: { followerId: viewerId, followingId: visibleId },
    });
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        prisma.follow.deleteMany({
          where: { followerId: viewerId, followingId: visibleId },
        }),
      ),
    );
    // Exactly one delete found a row; the rest are harmless no-ops. A
    // `delete` would have thrown for the losers.
    expect(results.reduce((sum, row) => sum + row.count, 0)).toBe(1);
  });
});
