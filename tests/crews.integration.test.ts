import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { recomputeCrews } from "@/lib/crews/recompute";
import { syncKitSurveyTraits } from "@/lib/crews/kit-survey";
import { backfillSamcartStarts, SAMCART_NO_DATE } from "@/lib/crews/samcart-start";
import { CrewError, joinOptionalCrew, leaveOptionalCrew, openCrewChat } from "@/lib/crews/membership";
import { loadCrewPage, loadViewerCrews } from "@/lib/crews/views";
import { listCrewsForUser, sharedCrews } from "@/lib/crews/queries";
import { parseSurveyMapping, readStoredSurveyTraits, storedSurveyTraits } from "@/lib/crews/survey-traits";
import {
  leaveConversation,
  readConversation,
  sendMessage,
  totalUnreadForUser,
} from "@/lib/messages/conversations";

/**
 * Crews against the database (DEC-078).
 *
 * The properties that need rows: the cohort comes from the original SamCart
 * start and never from when a row was written or a migration's entitlement;
 * the recompute is idempotent and never touches a member's own opt-in rows or
 * the opt-in crews; a retired roadmap's crew is archived, not deleted; the
 * crew chat follows the crew and is gated by crew membership rather than DM
 * settings; and the Kit and SamCart syncs write what they read.
 *
 * Everything runs scoped to this file's members, with seasons in 2041–2042
 * so no real cohort is involved. Needs the local Docker Postgres; skips
 * rather than fails without it.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
const users: string[] = [];
const crewRuleKeys = ["cohort:2041-fall", "cohort:2042-winter", "cohort:2041-spring"];
let trackSlug = "";
let productId = "";

const id: Record<string, string> = {};

async function makeMember(
  suffix: string,
  options: { entitlement?: "MANUAL" | "MIGRATION" | null; dm?: "EVERYONE" | "NOBODY" } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `it-crews-${stamp}-${suffix}@example.test`,
      handle: `itcrews${stamp}${suffix}`,
      name: `Crew ${suffix}`,
      status: "ACTIVE",
      profile: {
        create: { displayName: `Crew ${suffix}`, dmPreference: options.dm ?? "EVERYONE" },
      },
    },
    select: { id: true },
  });
  users.push(user.id);
  if (options.entitlement !== null) {
    await prisma.entitlement.create({
      data: {
        userId: user.id,
        productId,
        source: options.entitlement ?? "MANUAL",
        status: "ACTIVE",
        // An imported member's entitlement starts on the migration date, today
        // — which must never be read as when they started.
        startsAt: new Date(Date.now() - 60_000),
      },
    });
  }
  return user.id;
}

async function subscribe(userId: string, startedAt: Date | null, samcartId?: string) {
  return prisma.subscription.create({
    data: {
      userId,
      productId,
      status: "ACTIVE",
      samcartSubscriptionId: samcartId ?? null,
      startedAt,
      startedAtSource: startedAt ? "samcart_api" : null,
    },
  });
}

async function crewIdsOf(userId: string) {
  const rows = await prisma.crewMember.findMany({
    where: { userId },
    select: { source: true, crew: { select: { ruleKey: true, slug: true, kind: true } } },
  });
  return rows;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  const product = await prisma.product.upsert({
    where: { slug: "membership" },
    update: {},
    create: { slug: "membership", name: "Vegan University Membership", kind: "MEMBERSHIP" },
  });
  productId = product.id;

  // Fall 2041: started 15 Oct 2041. The row itself is written today, the
  // way an import would write it.
  id.fall = await makeMember("fall");
  await subscribe(id.fall, new Date("2041-10-15T15:00:00Z"));
  id.fall2 = await makeMember("falltwo");
  await subscribe(id.fall2, new Date("2041-09-20T15:00:00Z"));

  // Migrated, no SamCart start known: an entitlement from the migration and
  // a subscription row written today, neither of which is a start.
  id.migrated = await makeMember("migrated", { entitlement: "MIGRATION" });
  await subscribe(id.migrated, null);

  // Two subscriptions: the earliest (10 Dec 2041) wins → Winter 2042.
  id.winter = await makeMember("winter");
  await subscribe(id.winter, new Date("2042-07-01T15:00:00Z"));
  await subscribe(id.winter, new Date("2041-12-10T15:00:00Z"));

  // Survey trait, no subscription at all.
  id.gf = await makeMember("gf");
  await prisma.profile.update({
    where: { userId: id.gf },
    data: {
      surveyTraits: storedSurveyTraits({
        found: true,
        match: { traits: ["gf"], fields: { diet: "GF" } },
        mapping: parseSurveyMapping(undefined),
      }) as unknown as Prisma.InputJsonValue,
      surveySyncedAt: new Date(),
    },
  });

  // Somebody with no access at all: never placed automatically.
  id.lapsed = await makeMember("lapsed", { entitlement: null });
  await subscribe(id.lapsed, new Date("2041-10-01T15:00:00Z"));

  id.stranger = await makeMember("stranger");

  // A published roadmap track the fall member is on.
  trackSlug = `it-crews-${stamp}`;
  const track = await prisma.roadmapTrack.create({
    data: { slug: trackSlug, name: `Crew Test ${stamp}`, published: true },
  });
  await prisma.memberRoadmap.create({ data: { userId: id.fall, trackId: track.id } });
});

afterAll(async () => {
  if (reachable) {
    const crews = await prisma.crew.findMany({
      where: { ruleKey: { in: [...crewRuleKeys, `roadmap:${trackSlug}`] } },
      select: { id: true, conversationId: true },
    });
    const conversations = crews.flatMap((crew) => (crew.conversationId ? [crew.conversationId] : []));
    await prisma.crew.deleteMany({ where: { id: { in: crews.map((crew) => crew.id) } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversations } } });
    await prisma.memberRoadmap.deleteMany({ where: { userId: { in: users } } });
    await prisma.roadmapTrack.deleteMany({ where: { slug: trackSlug } });
    await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
    await prisma.entitlement.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
  await prisma.$disconnect();
});

describe("recompute", () => {
  it("places members by their original SamCart start, never the migration", async () => {
    if (!reachable) return;
    const result = await recomputeCrews({ onlyUserIds: users, record: false });
    // lapsed has no access, so is not considered; of the rest, migrated, gf
    // and stranger have no known start.
    expect(result.members).toBe(6);
    expect(result.withoutStart).toBe(3);

    const fall = await crewIdsOf(id.fall);
    expect(fall.map((row) => row.crew.ruleKey)).toContain("cohort:2041-fall");
    expect(fall.every((row) => row.source === "AUTO")).toBe(true);

    const winter = await crewIdsOf(id.winter);
    expect(winter.map((row) => row.crew.ruleKey)).toEqual(["cohort:2042-winter"]);

    // Their entitlement and their subscription row were both written today,
    // the migration date: neither places them in a cohort (today's season
    // would be the bug).
    const migrated = await crewIdsOf(id.migrated);
    expect(migrated.filter((row) => row.crew.kind === "COHORT")).toEqual([]);

    expect(await crewIdsOf(id.lapsed)).toEqual([]);

    const cohort = await prisma.crew.findUniqueOrThrow({ where: { ruleKey: "cohort:2041-fall" } });
    expect(cohort.name).toBe("Fall 2041 cohort");
    expect(cohort.slug).toBe("cohort-2041-fall");
    expect(cohort.kind).toBe("COHORT");
  });

  it("puts survey traits and roadmaps in their crews", async () => {
    if (!reachable) return;
    const gf = await crewIdsOf(id.gf);
    expect(gf.map((row) => row.crew.ruleKey)).toEqual(["trait:gf"]);

    const fall = await crewIdsOf(id.fall);
    expect(fall.map((row) => row.crew.ruleKey)).toContain(`roadmap:${trackSlug}`);
    const roadmapCrew = await prisma.crew.findUniqueOrThrow({
      where: { ruleKey: `roadmap:${trackSlug}` },
    });
    expect(roadmapCrew.name).toBe(`Crew Test ${stamp} crew`);
  });

  it("changes nothing when run again", async () => {
    if (!reachable) return;
    const again = await recomputeCrews({ onlyUserIds: users, record: false });
    expect(again.added).toBe(0);
    expect(again.removed).toBe(0);
    expect(again.crewsCreated).toBe(0);
  });

  it("never touches opt-in rows or opt-in crews, and removes stale AUTO rows", async () => {
    if (!reachable) return;
    const posse = await prisma.crew.findUnique({ where: { slug: "wfpb-posse" } });
    const newbies = await prisma.crew.findUnique({ where: { ruleKey: "trait:new" } });
    const gfCrew = await prisma.crew.findUnique({ where: { ruleKey: "trait:gf" } });
    if (!posse || !newbies || !gfCrew) throw new Error("seeded crews are missing");

    await prisma.crewMember.createMany({
      data: [
        // Their own choice, on an opt-in crew.
        { crewId: posse.id, userId: id.stranger, source: "OPT_IN" },
        // Their own row on a rule crew they do not qualify for.
        { crewId: gfCrew.id, userId: id.stranger, source: "OPT_IN" },
        // A stale automatic row: the rule no longer wants them.
        { crewId: newbies.id, userId: id.stranger, source: "AUTO" },
      ],
    });

    const result = await recomputeCrews({ onlyUserIds: users, record: false });
    expect(result.removed).toBe(1);

    const rows = await crewIdsOf(id.stranger);
    expect(rows.map((row) => `${row.crew.slug}:${row.source}`).sort()).toEqual([
      "gluten-free-gang:OPT_IN",
      "wfpb-posse:OPT_IN",
    ]);
    // Nobody here was put in an opt-in crew automatically.
    expect(
      await prisma.crewMember.count({
        where: { userId: { in: users }, source: "AUTO", crew: { kind: "OPTIONAL" } },
      }),
    ).toBe(0);
  });

  it("archives a retired roadmap's crew rather than deleting it, and restores it", async () => {
    if (!reachable) return;
    await prisma.roadmapTrack.update({ where: { slug: trackSlug }, data: { published: false } });
    const retired = await recomputeCrews({ onlyUserIds: users, record: false });
    expect(retired.crewsArchived).toBe(1);
    const archived = await prisma.crew.findUniqueOrThrow({
      where: { ruleKey: `roadmap:${trackSlug}` },
      select: { archivedAt: true, _count: { select: { members: true } } },
    });
    expect(archived.archivedAt).not.toBeNull();
    // Kept as it was, history and all.
    expect(archived._count.members).toBe(1);
    expect((await listCrewsForUser(id.fall)).some((crew) => crew.kind === "ROADMAP")).toBe(false);

    await prisma.roadmapTrack.update({ where: { slug: trackSlug }, data: { published: true } });
    const restored = await recomputeCrews({ onlyUserIds: users, record: false });
    expect(restored.crewsRestored).toBe(1);
    expect((await listCrewsForUser(id.fall)).some((crew) => crew.kind === "ROADMAP")).toBe(true);
  });
});

describe("crew chat", () => {
  let chatId = "";

  it("is created on first open with the whole crew in it", async () => {
    if (!reachable) return;
    chatId = await openCrewChat(id.fall, "cohort-2041-fall");
    const crew = await prisma.crew.findUniqueOrThrow({ where: { slug: "cohort-2041-fall" } });
    expect(crew.conversationId).toBe(chatId);
    const seats = await prisma.conversationMember.findMany({
      where: { conversationId: chatId },
      select: { userId: true },
    });
    expect(seats.map((seat) => seat.userId).sort()).toEqual([id.fall, id.fall2].sort());

    // Opening it again finds the same chat.
    expect(await openCrewChat(id.fall2, "cohort-2041-fall")).toBe(chatId);
  });

  it("refuses anyone outside the crew", async () => {
    if (!reachable) return;
    await expect(openCrewChat(id.stranger, "cohort-2041-fall")).rejects.toBeInstanceOf(CrewError);
    await expect(
      sendMessage({ conversationId: chatId, authorId: id.stranger, body: "let me in" }),
    ).rejects.toThrow();
  });

  it("is gated by crew membership, not by direct-message settings", async () => {
    if (!reachable) return;
    await prisma.profile.update({ where: { userId: id.fall }, data: { dmPreference: "NOBODY" } });
    const message = await sendMessage({
      conversationId: chatId,
      authorId: id.fall2,
      body: "Hello, fall crew",
    });
    expect(message.body).toBe("Hello, fall crew");
    const thread = await readConversation(chatId, id.fall);
    expect(thread?.kind).toBe("crew");
    expect(thread?.crew?.slug).toBe("cohort-2041-fall");
    expect(thread?.memberCount).toBe(2);
    await prisma.profile.update({ where: { userId: id.fall }, data: { dmPreference: "EVERYONE" } });
  });

  it("hides the messages of someone on the other side of a block", async () => {
    if (!reachable) return;
    await prisma.userBlock.create({ data: { blockerId: id.fall2, blockedId: id.fall } });
    // A block does not close the crew's room...
    await sendMessage({ conversationId: chatId, authorId: id.fall, body: "still here" });
    // ...but the person who blocked does not see it, nor count it unread.
    const thread = await readConversation(chatId, id.fall2);
    expect(thread?.messages.map((message) => message.body)).not.toContain("still here");
    expect(thread?.hiddenAuthorIds).toContain(id.fall);
    const before = await totalUnreadForUser(id.fall2);
    await sendMessage({ conversationId: chatId, authorId: id.fall, body: "and again" });
    expect(await totalUnreadForUser(id.fall2)).toBe(before);
    await prisma.userBlock.deleteMany({ where: { blockerId: id.fall2, blockedId: id.fall } });
  });

  it("keeps a member out who left the chat, and follows crew changes", async () => {
    if (!reachable) return;
    await leaveConversation(chatId, id.fall2);
    await recomputeCrews({ onlyUserIds: users, record: false });
    const left = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: chatId, userId: id.fall2 } },
    });
    expect(left.leftAt).not.toBeNull();

    // Leaving the crew (their start moves to another season) ends the seat;
    // coming back to the crew brings them back to the chat.
    await prisma.subscription.updateMany({
      where: { userId: id.fall2 },
      data: { startedAt: new Date("2041-04-02T15:00:00Z") },
    });
    await recomputeCrews({ onlyUserIds: users, record: false });
    expect(await prisma.crewMember.count({ where: { userId: id.fall2, crew: { slug: "cohort-2041-fall" } } })).toBe(0);

    await prisma.subscription.updateMany({
      where: { userId: id.fall2 },
      data: { startedAt: new Date("2041-09-20T15:00:00Z") },
    });
    const back = await recomputeCrews({ onlyUserIds: users, record: false });
    expect(back.chats.rejoined).toBe(1);
    const seat = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId: chatId, userId: id.fall2 } },
    });
    expect(seat.leftAt).toBeNull();
  });
});

describe("opt-in crews", () => {
  it("are joined and left by the member, and only by them", async () => {
    if (!reachable) return;
    await joinOptionalCrew(id.gf, "on-the-road-to-vegan");
    const row = await prisma.crewMember.findFirstOrThrow({
      where: { userId: id.gf, crew: { slug: "on-the-road-to-vegan" } },
    });
    expect(row.source).toBe("OPT_IN");
    await joinOptionalCrew(id.gf, "on-the-road-to-vegan");
    expect(await prisma.crewMember.count({ where: { userId: id.gf, crew: { slug: "on-the-road-to-vegan" } } })).toBe(1);

    await leaveOptionalCrew(id.gf, "on-the-road-to-vegan");
    expect(await prisma.crewMember.count({ where: { userId: id.gf, crew: { slug: "on-the-road-to-vegan" } } })).toBe(0);
  });

  it("refuses joining an automatic crew, or leaving one", async () => {
    if (!reachable) return;
    await expect(joinOptionalCrew(id.stranger, "nooch-newbies")).rejects.toMatchObject({
      code: "not-optional",
    });
    await expect(leaveOptionalCrew(id.gf, "gluten-free-gang")).rejects.toMatchObject({
      code: "automatic",
    });
  });
});

describe("what members see", () => {
  it("lists a member's crews and the ones they can join", async () => {
    if (!reachable) return;
    const crews = await loadViewerCrews(id.fall);
    expect(crews.startKnown).toBe(true);
    expect(crews.mine.map((crew) => crew.slug)).toContain("cohort-2041-fall");
    expect(crews.mine.find((crew) => crew.slug === "cohort-2041-fall")?.reason).toBe(
      "You started Vegan University in fall 2041.",
    );
    expect(crews.joinable.every((crew) => crew.kind === "OPTIONAL")).toBe(true);

    expect((await loadViewerCrews(id.migrated)).startKnown).toBe(false);
  });

  it("shows an automatic crew's members only to the crew, minus hidden members", async () => {
    if (!reachable) return;
    const outsider = await loadCrewPage({ slug: "cohort-2041-fall", viewerId: id.stranger, staff: false });
    expect(outsider?.canSeeMembers).toBe(false);
    expect(outsider?.members).toEqual([]);

    await prisma.profile.update({ where: { userId: id.fall2 }, data: { directoryVisible: false } });
    const insider = await loadCrewPage({ slug: "cohort-2041-fall", viewerId: id.fall, staff: false });
    expect(insider?.canSeeMembers).toBe(true);
    expect(insider?.members.map((member) => member.userId)).toEqual([id.fall]);
    expect(insider?.privateCount).toBe(1);
    await prisma.profile.update({ where: { userId: id.fall2 }, data: { directoryVisible: true } });

    expect(await sharedCrews(id.fall, id.fall2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "cohort-2041-fall" })]),
    );
  });

  it("shows a member's city in the list only if they show it", async () => {
    if (!reachable) return;
    await prisma.profile.update({
      where: { userId: id.fall2 },
      data: { city: "Lisbon", privacy: { showLocation: false, showLinks: true, showInterests: true } },
    });
    await prisma.profile.update({
      where: { userId: id.fall },
      data: { city: "Porto", privacy: { showLocation: false, showLinks: true, showInterests: true } },
    });
    try {
      const page = await loadCrewPage({ slug: "cohort-2041-fall", viewerId: id.fall, staff: false });
      const city = (userId: string) => page?.members.find((member) => member.userId === userId)?.city;
      expect(city(id.fall2)).toBeNull();
      // Your own city is yours to see.
      expect(city(id.fall)).toBe("Porto");

      await prisma.profile.update({ where: { userId: id.fall2 }, data: { privacy: Prisma.DbNull } });
      const open = await loadCrewPage({ slug: "cohort-2041-fall", viewerId: id.fall, staff: false });
      expect(open?.members.find((member) => member.userId === id.fall2)?.city).toBe("Lisbon");
    } finally {
      await prisma.profile.updateMany({
        where: { userId: { in: [id.fall, id.fall2] } },
        data: { city: null, privacy: Prisma.DbNull },
      });
    }
  });
});

describe("Kit survey sync", () => {
  it("stores only the answers that produced a trait", async () => {
    if (!reachable) return;
    const result = await syncKitSurveyTraits({
      userIds: [id.stranger],
      reader: async () => ({
        found: true,
        fields: { rm_audience_segment: "advanced", last_name: "New", phone: "555-0100", utm_campaign: "new" },
      }),
      mapping: parseSurveyMapping(undefined),
      spacingMs: 0,
      record: false,
    });
    expect(result.synced).toBe(1);
    expect(result.fieldKeys).toEqual(["last_name", "phone", "rm_audience_segment", "utm_campaign"]);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id.stranger } });
    const stored = readStoredSurveyTraits(profile.surveyTraits);
    expect(stored?.traits).toEqual(["advanced"]);
    expect(stored?.fields).toEqual({ rm_audience_segment: "advanced" });
    expect(profile.surveySyncedAt).not.toBeNull();
  });

  it("does not re-read a member it read this week, unless the mapping changed", async () => {
    if (!reachable) return;
    const reader = async () => ({ found: false as const });
    const again = await syncKitSurveyTraits({
      userIds: [id.stranger],
      reader,
      mapping: parseSurveyMapping(undefined),
      spacingMs: 0,
      record: false,
    });
    expect(again.synced).toBe(0);

    const remapped = await syncKitSurveyTraits({
      userIds: [id.stranger],
      reader,
      mapping: parseSurveyMapping("advanced=level:expert"),
      spacingMs: 0,
      record: false,
    });
    expect(remapped.synced).toBe(1);
    expect(remapped.notFound).toBe(1);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id.stranger } });
    expect(readStoredSurveyTraits(profile.surveyTraits)).toMatchObject({ found: false, traits: [] });
  });

  it("changes nothing without Kit credentials", async () => {
    if (!reachable) return;
    const saved = { key: process.env.KIT_API_KEY, secret: process.env.KIT_API_SECRET };
    process.env.KIT_API_KEY = "";
    process.env.KIT_API_SECRET = "";
    try {
      const before = await prisma.profile.findUniqueOrThrow({ where: { userId: id.gf } });
      const result = await syncKitSurveyTraits({ userIds: [id.gf], record: false });
      expect(result.configured).toBe(false);
      const after = await prisma.profile.findUniqueOrThrow({ where: { userId: id.gf } });
      expect(after.surveyTraits).toEqual(before.surveyTraits);
      expect(after.surveySyncedAt).toEqual(before.surveySyncedAt);
    } finally {
      // Assigning undefined would store the string "undefined".
      if (saved.key === undefined) delete process.env.KIT_API_KEY;
      else process.env.KIT_API_KEY = saved.key;
      if (saved.secret === undefined) delete process.env.KIT_API_SECRET;
      else process.env.KIT_API_SECRET = saved.secret;
    }
  });

  it("stops on a Kit outage instead of burning through the batch", async () => {
    if (!reachable) return;
    const { KitApiError } = await import("@/lib/roadmap/kit-client");
    let calls = 0;
    const result = await syncKitSurveyTraits({
      userIds: [id.fall, id.fall2, id.winter],
      reader: async () => {
        calls += 1;
        throw new KitApiError("Kit GET /subscribers HTTP 429", 429);
      },
      mapping: parseSurveyMapping(undefined),
      spacingMs: 0,
      record: false,
    });
    expect(calls).toBe(1);
    expect(result.stoppedEarly).toBe("Kit rate limit");
    expect(result.synced).toBe(0);
  });
});

describe("SamCart start backfill", () => {
  it("dates a membership subscription from the SamCart API, and marks one it cannot", async () => {
    if (!reachable) return;
    const dated = await subscribe(id.stranger, null, `it-sub-${stamp}-a`);
    const undated = await subscribe(id.stranger, null, `it-sub-${stamp}-b`);
    const result = await backfillSamcartStarts({
      userIds: [id.stranger],
      reader: async (samcartId) =>
        samcartId.endsWith("-a")
          ? { ok: true, startedAt: new Date("2041-03-03T15:00:00Z") }
          : { ok: true, startedAt: null },
      spacingMs: 0,
      record: false,
    });
    expect(result.checked).toBe(2);
    expect(result.filled).toBe(1);
    expect(result.undated).toBe(1);

    const a = await prisma.subscription.findUniqueOrThrow({ where: { id: dated.id } });
    expect(a.startedAt?.toISOString()).toBe("2041-03-03T15:00:00.000Z");
    expect(a.startedAtSource).toBe("samcart_api");
    const b = await prisma.subscription.findUniqueOrThrow({ where: { id: undated.id } });
    expect(b.startedAt).toBeNull();
    expect(b.startedAtSource).toBe(SAMCART_NO_DATE);

    // Neither is asked about again on the next run.
    const next = await backfillSamcartStarts({
      userIds: [id.stranger],
      reader: async () => {
        throw new Error("should not be called");
      },
      spacingMs: 0,
      record: false,
    });
    expect(next.checked).toBe(0);
  });
});
