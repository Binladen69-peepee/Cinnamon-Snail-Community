import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type SkillLevel } from "@prisma/client";
import { loadMemberSignals } from "@/lib/social/signals";
import { ensureWeeklyMatch, peopleYouShouldMeet } from "@/lib/social/suggestions";
import { scoreCandidate } from "@/lib/social/scoring";

/**
 * The weekly match and "people you should meet", against the database.
 *
 * They now read what members actually set: their tags (`ProfileInterest`,
 * with each tag's kind) and `Profile.skill`, with the old free-text columns
 * only for a member who never set the new ones, and nothing from a member
 * who hides how they cook. Who can be matched at all is unchanged: active,
 * in the directory, opted in, and never across a block.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let reachable = true;
const made: string[] = [];
const ids: Record<string, string> = {};
// A Wednesday far from any real data, so this week's match is drawn fresh.
const NOW = new Date("2032-06-16T12:00:00Z");

async function makeMember(
  key: string,
  input: {
    tags?: string[];
    skill?: SkillLevel;
    skillLevel?: string;
    cookingInterests?: string[];
    dietaryInterests?: string[];
    privacy?: Record<string, boolean>;
    directoryVisible?: boolean;
    matchingOptIn?: boolean;
    status?: "ACTIVE" | "SUSPENDED";
  } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `it-signals-${stamp}-${key}@example.test`,
      handle: `itsig${stamp}${key}`.slice(0, 32),
      name: `Signals ${key}`,
      status: input.status ?? "ACTIVE",
      lastLoginAt: new Date(),
      profile: {
        create: {
          displayName: `Signals ${key}`,
          skill: input.skill ?? null,
          skillLevel: input.skillLevel ?? null,
          cookingInterests: input.cookingInterests ?? undefined,
          dietaryInterests: input.dietaryInterests ?? undefined,
          privacy: input.privacy ?? undefined,
          directoryVisible: input.directoryVisible ?? true,
          matchingOptIn: input.matchingOptIn ?? true,
        },
      },
    },
    select: { id: true, profile: { select: { id: true } } },
  });
  made.push(user.id);
  ids[key] = user.id;
  if (input.tags?.length) {
    const interests = await prisma.interest.findMany({
      where: { slug: { in: input.tags } },
      select: { id: true },
    });
    expect(interests).toHaveLength(input.tags.length);
    await prisma.profileInterest.createMany({
      data: interests.map((interest) => ({
        profileId: user.profile!.id,
        interestId: interest.id,
      })),
    });
  }
  return user.id;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  // The catalogue rows these tags need; mirrored from code if they are missing.
  const needed = ["japanese", "tofu-and-tempeh", "gluten-free"];
  if ((await prisma.interest.count({ where: { slug: { in: needed } } })) < needed.length) {
    const { syncInterests } = await import("@/lib/community/interest-sync");
    await syncInterests();
  }

  await makeMember("viewer", { tags: ["japanese", "tofu-and-tempeh"], skill: "CONFIDENT" });
  // Tags win: the old column says tofu, but this member's tags say otherwise.
  await makeMember("tagged", { tags: ["japanese"], cookingInterests: ["tofu"] });
  // Never picked tags: the old columns stand in, mapped onto the tags.
  await makeMember("legacy", { cookingInterests: ["tofu"], skillLevel: "Confident" });
  await makeMember("private", {
    tags: ["japanese", "tofu-and-tempeh"],
    skill: "CONFIDENT",
    privacy: { showInterests: false },
  });
  await makeMember("unlisted", { tags: ["japanese"], directoryVisible: false });
  await makeMember("optedout", { tags: ["japanese"], matchingOptIn: false });
  await makeMember("suspended", { tags: ["japanese"], status: "SUSPENDED" });
  await makeMember("blocker", { tags: ["japanese"] });
  await prisma.userBlock.create({ data: { blockerId: ids.blocker!, blockedId: ids.viewer! } });
});

afterAll(async () => {
  if (reachable) {
    await prisma.user.deleteMany({ where: { id: { in: made } } });
  }
  await prisma.$disconnect();
});

describe("loadMemberSignals", () => {
  it("reads the viewer's tags and level", async ({ skip }) => {
    if (!reachable) skip();
    const { viewer } = await loadMemberSignals(ids.viewer!);
    expect(viewer?.interests).toEqual(["Japanese food", "tofu and tempeh"]);
    expect(viewer?.skillLevel).toBe("confident");
  });

  it("uses tags over the old columns, and the old columns only without tags", async ({
    skip,
  }) => {
    if (!reachable) skip();
    const { candidates } = await loadMemberSignals(ids.viewer!);
    const byId = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
    expect(byId.get(ids.tagged!)?.interests).toEqual(["Japanese food"]);
    expect(byId.get(ids.legacy!)?.interests).toEqual(["tofu and tempeh"]);
    expect(byId.get(ids.legacy!)?.skillLevel).toBe("confident");
  });

  it("takes nothing from a member who hides how they cook", async ({ skip }) => {
    if (!reachable) skip();
    const { candidates } = await loadMemberSignals(ids.viewer!);
    const hidden = candidates.find((candidate) => candidate.userId === ids.private);
    expect(hidden).toBeDefined();
    expect(hidden?.interests).toEqual([]);
    expect(hidden?.skillLevel).toBeNull();
  });

  it("keeps who can be matched exactly as it was", async ({ skip }) => {
    if (!reachable) skip();
    const { candidates } = await loadMemberSignals(ids.viewer!);
    const found = new Set(candidates.map((candidate) => candidate.userId));
    expect(found.has(ids.viewer!)).toBe(false);
    for (const key of ["tagged", "legacy", "private"]) expect(found.has(ids[key]!), key).toBe(true);
    for (const key of ["unlisted", "optedout", "suspended", "blocker"]) {
      expect(found.has(ids[key]!), key).toBe(false);
    }
  });
});

describe("what members are told", () => {
  it("gives reasons in the words of the tags members picked", async ({ skip }) => {
    if (!reachable) skip();
    const { viewer, candidates } = await loadMemberSignals(ids.viewer!);
    const legacy = candidates.find((candidate) => candidate.userId === ids.legacy)!;
    const tagged = candidates.find((candidate) => candidate.userId === ids.tagged)!;
    const hidden = candidates.find((candidate) => candidate.userId === ids.private)!;

    expect(scoreCandidate(viewer!, legacy).reason).toContain("You both cook tofu and tempeh");
    expect(scoreCandidate(viewer!, legacy).reason).toContain("you are cooking at the same level");
    expect(scoreCandidate(viewer!, tagged).reason).toContain("You both cook Japanese food");
    // Same tags and level, but hidden: nothing about how they cook is said.
    const quiet = scoreCandidate(viewer!, hidden);
    expect(quiet.sharedInterests).toEqual([]);
    expect(quiet.reason).not.toMatch(/cook|level/);

    const suggestions = await peopleYouShouldMeet(ids.viewer!, 500);
    const mine = suggestions.filter((suggestion) => made.includes(suggestion.userId));
    expect(mine.map((suggestion) => suggestion.userId)).not.toContain(ids.blocker);
    expect(mine.find((suggestion) => suggestion.userId === ids.legacy)?.reason).toContain(
      "tofu and tempeh",
    );
  });

  it("draws the weekly match from the same signals, with an opener that reads", async ({
    skip,
  }) => {
    if (!reachable) skip();
    // A member of this file's own, so the draw is between our members only.
    const asker = await makeMember("asker", { tags: ["gluten-free"] });
    await makeMember("glutenfree", { tags: ["gluten-free"] });
    const match = await ensureWeeklyMatch(asker, NOW);
    // In 2032 nobody here is "recently active" and the asker is in no room,
    // so the one member sharing a tag is the clear best fit, and the match
    // says which tag, in words.
    expect(match?.matchedUserId).toBe(ids.glutenfree);
    expect(match?.reason).toContain("You both cook gluten-free food");
    expect(match?.starter).toContain("we both cook gluten-free food");
    await prisma.memberMatch.deleteMany({ where: { userId: asker } });
  });
});
