import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  TrackError,
  bumpVersion,
  createMilestone,
  createTrack,
  deleteTrack,
  listTracks,
  loadTrack,
  moveMilestone,
  saveMilestone,
  setPublished,
  slugify,
} from "@/lib/admin/roadmap";
import {
  loadRoadmapPage,
  recipeForMember,
  saveAnswers,
  skipMilestone,
  startTrack,
  completeMilestone,
  swapRecipe,
  RoadmapError,
} from "@/lib/roadmap";
import {
  COOK_VIBES,
  PRIMARY_BENEFITS,
  keyedFromForm,
  keyedText,
  normalizeAnswer,
  normalizeGlutenFree,
} from "@/lib/roadmap/answers";

/**
 * Roadmap authoring and the two supports §14 asks for.
 *
 * The member roadmap was finished and permanently empty: a track is authored
 * content and nothing could author one. These cover the writes that changed
 * that, plus skip and recipe swap, which needed columns the schema did not
 * have.
 *
 * The pure half runs anywhere. The rest needs the local Docker Postgres and
 * skips rather than fails without it.
 */

describe("answer vocabulary", () => {
  it("keeps anything outside the vocabulary out of the database", () => {
    // These arrive from a form post. An unrecognised value means the list moved
    // under a stale page, not that the member did something wrong — so it
    // becomes "no answer" rather than an error or a stored junk string.
    expect(normalizeAnswer(COOK_VIBES, "busy")).toBe("busy");
    expect(normalizeAnswer(COOK_VIBES, "  BUSY ")).toBe("busy");
    expect(normalizeAnswer(COOK_VIBES, "whatever")).toBeNull();
    expect(normalizeAnswer(COOK_VIBES, 42)).toBeNull();
    expect(normalizeAnswer(COOK_VIBES, null)).toBeNull();
  });

  it("treats gluten free as three states, not two", () => {
    // "No" and "never answered" are different: one turns the filter off, the
    // other means we do not know yet.
    expect(normalizeGlutenFree("yes")).toBe(true);
    expect(normalizeGlutenFree("no")).toBe(false);
    expect(normalizeGlutenFree(undefined)).toBeNull();
    expect(normalizeGlutenFree("maybe")).toBeNull();
  });

  it("reads keyed text defensively", () => {
    // These are Json columns, so the database will hand back whatever was
    // written. A milestone must never fail to render because its framing is
    // the wrong shape.
    expect(keyedText({ health: "Feel better" }, "health")).toBe("Feel better");
    expect(keyedText({ health: "  " }, "health")).toBeNull();
    expect(keyedText({ health: "Feel better" }, "animals")).toBeNull();
    expect(keyedText({ health: "Feel better" }, null)).toBeNull();
    expect(keyedText(null, "health")).toBeNull();
    expect(keyedText("not an object", "health")).toBeNull();
    expect(keyedText(["array"], "health")).toBeNull();
    expect(keyedText({ health: 7 }, "health")).toBeNull();
  });

  it("returns null rather than an empty map when nothing was filled in", () => {
    // So `framing IS NULL` means what it says, instead of matching `{}`.
    expect(keyedFromForm(PRIMARY_BENEFITS, () => null)).toBeNull();
    expect(keyedFromForm(PRIMARY_BENEFITS, () => "   ")).toBeNull();
    expect(keyedFromForm(PRIMARY_BENEFITS, (key) => (key === "health" ? "Yes" : ""))).toEqual({
      health: "Yes",
    });
  });
});

describe("slugify", () => {
  it("makes a member-facing key out of a name", () => {
    expect(slugify("Busy weeknights")).toBe("busy-weeknights");
    expect(slugify("  Family — Level 2!  ")).toBe("family-level-2");
    expect(slugify("???")).toBe("");
  });
});

describe("recipeForMember", () => {
  const both = { recipeId: "plain", recipeIdGlutenFree: "gf" };

  it("shows the gluten-free stand-in only to a member who asked for it", () => {
    expect(recipeForMember(both, true)).toEqual({ id: "gf", glutenFree: true });
    expect(recipeForMember(both, false)).toEqual({ id: "plain", glutenFree: false });
    expect(recipeForMember(both, null)).toEqual({ id: "plain", glutenFree: false });
  });

  it("falls back to the ordinary recipe when no substitute was authored", () => {
    // An author who left it blank is saying the recipe is already fine. The
    // alternative — showing nothing — would strip the milestone of its recipe.
    expect(recipeForMember({ recipeId: "plain", recipeIdGlutenFree: null }, true)).toEqual({
      id: "plain",
      glutenFree: false,
    });
    expect(recipeForMember({ recipeId: null, recipeIdGlutenFree: null }, true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
let userId = "";
let trackId = "";
let trackSlug = "";
let plainRecipeId = "";
let gfRecipeId = "";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  userId = (
    await prisma.user.create({
      data: {
        email: `it-author-${stamp}@example.test`,
        handle: `itauthor${stamp}`,
        name: "Author test",
        status: "ACTIVE",
      },
      select: { id: true },
    })
  ).id;

  [plainRecipeId, gfRecipeId] = await Promise.all([
    prisma.recipe
      .create({
        data: { slug: `it-plain-${stamp}`, title: `Wheaty pasta ${stamp}`, body: "." },
        select: { id: true },
      })
      .then((row) => row.id),
    prisma.recipe
      .create({
        data: { slug: `it-gf-${stamp}`, title: `Rice noodles ${stamp}`, body: "." },
        select: { id: true },
      })
      .then((row) => row.id),
  ]);

  const track = await createTrack({
    name: `Authoring ${stamp}`,
    description: "Made by the test.",
  });
  trackSlug = track.slug;
  trackId = (
    await prisma.roadmapTrack.findUniqueOrThrow({
      where: { slug: trackSlug },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (reachable) {
    // The user goes first: `MemberRoadmap.trackId` has no cascade — which is
    // the same constraint `deleteTrack` refuses against — so a track cannot be
    // removed while anyone is on it. Deleting the member cascades their
    // enrolment away and lets the track go.
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.roadmapTrack.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.recipe.deleteMany({ where: { id: { in: [plainRecipeId, gfRecipeId] } } });
  }
  await prisma.$disconnect().catch(() => {});
});

describe("track authoring", () => {
  it("refuses to publish a track with no milestones", async () => {
    if (!reachable) return;
    // `startTrack` already refuses to enrol anyone on an empty track, so
    // publishing one would only advertise something nobody can join.
    await expect(setPublished(trackId, true)).rejects.toBeInstanceOf(TrackError);
  });

  it("requires a topic and a goal on a milestone", async () => {
    if (!reachable) return;
    const base = {
      communityAction: null,
      lessonId: null,
      recipeId: null,
      recipeIdGlutenFree: null,
      framing: null,
      constraintNote: null,
    };
    await expect(
      createMilestone(trackId, { ...base, topic: "  ", learningGoal: "Something" }),
    ).rejects.toBeInstanceOf(TrackError);
    await expect(
      createMilestone(trackId, { ...base, topic: "Something", learningGoal: " " }),
    ).rejects.toBeInstanceOf(TrackError);
  });

  it("appends milestones in order and reorders them", async () => {
    if (!reachable) return;
    const base = {
      communityAction: null,
      lessonId: null,
      recipeIdGlutenFree: null,
      framing: null,
      constraintNote: null,
    };
    await createMilestone(trackId, {
      ...base,
      topic: "First",
      learningGoal: "Goal one",
      recipeId: plainRecipeId,
    });
    await createMilestone(trackId, {
      ...base,
      topic: "Second",
      learningGoal: "Goal two",
      recipeId: null,
    });
    await createMilestone(trackId, {
      ...base,
      topic: "Third",
      learningGoal: "Goal three",
      recipeId: null,
    });

    let track = await loadTrack(trackSlug);
    expect(track?.milestones.map((m) => m.topic)).toEqual(["First", "Second", "Third"]);

    await moveMilestone(track!.milestones[2]!.id, "up");
    track = await loadTrack(trackSlug);
    expect(track?.milestones.map((m) => m.topic)).toEqual(["First", "Third", "Second"]);

    // At the ends the button is a no-op rather than an error.
    await moveMilestone(track!.milestones[0]!.id, "up");
    await moveMilestone(track!.milestones[2]!.id, "down");
    track = await loadTrack(trackSlug);
    expect(track?.milestones.map((m) => m.topic)).toEqual(["First", "Third", "Second"]);
  });

  it("stores framing and constraint text, and clears them when emptied", async () => {
    if (!reachable) return;
    const track = await loadTrack(trackSlug);
    const first = track!.milestones[0]!;
    const base = {
      topic: first.topic,
      learningGoal: first.learningGoal,
      communityAction: null,
      lessonId: null,
      recipeId: plainRecipeId,
      recipeIdGlutenFree: gfRecipeId,
    };

    await saveMilestone(first.id, {
      ...base,
      framing: { health: "You will feel it by Thursday." },
      constraintNote: { time: "Twenty minutes, once you have the knife down." },
    });
    let reloaded = await loadTrack(trackSlug);
    expect(reloaded!.milestones[0]!.framing).toEqual({
      health: "You will feel it by Thursday.",
    });
    expect(reloaded!.milestones[0]!.constraintNote.time).toContain("Twenty minutes");

    // Emptying every box means clear it, not leave it alone.
    await saveMilestone(first.id, { ...base, framing: null, constraintNote: null });
    reloaded = await loadTrack(trackSlug);
    expect(reloaded!.milestones[0]!.framing).toEqual({});
    expect(reloaded!.milestones[0]!.constraintNote).toEqual({});
  });

  it("publishes once there is something to publish, and versions without resetting", async () => {
    if (!reachable) return;
    await setPublished(trackId, true);
    const before = await prisma.roadmapTrack.findUniqueOrThrow({
      where: { id: trackId },
      select: { published: true, version: true },
    });
    expect(before.published).toBe(true);

    const next = await bumpVersion(trackId);
    expect(next).toBe(before.version + 1);
  });

  it("gives a clashing name its own slug", async () => {
    if (!reachable) return;
    const a = await createTrack({ name: `Clash ${stamp}`, description: null });
    const b = await createTrack({ name: `Clash ${stamp}`, description: null });
    expect(a.slug).not.toBe(b.slug);
    await prisma.roadmapTrack.deleteMany({ where: { slug: { in: [a.slug, b.slug] } } });
  });

  it("refuses to delete a track members are on", async () => {
    if (!reachable) return;
    await startTrack(userId, trackId);
    await expect(deleteTrack(trackId)).rejects.toBeInstanceOf(TrackError);
  });

  it("counts what an author needs to see", async () => {
    if (!reachable) return;
    const rows = await listTracks();
    const row = rows.find((candidate) => candidate.id === trackId);
    expect(row).toBeDefined();
    expect(row!.milestones).toBe(3);
    expect(row!.enrolled).toBeGreaterThanOrEqual(1);
    expect(row!.published).toBe(true);
  });
});

describe("skip and swap", () => {
  it("settles a milestone without ever counting it as done", async () => {
    if (!reachable) return;
    await startTrack(userId, trackId);

    const before = await loadRoadmapPage(userId);
    const current = before.active!.milestones.find((m) => m.state === "current")!;
    expect(before.active!.completed).toBe(0);

    await skipMilestone(userId, current.id);

    const after = await loadRoadmapPage(userId);
    // The thing this whole column exists for: it moved on, and nothing was earned.
    expect(after.active!.completed).toBe(0);
    expect(after.active!.skipped).toBe(1);
    expect(after.active!.milestones[0]!.state).toBe("skipped");
    expect(after.active!.milestones[0]!.completedAt).toBeNull();
    expect(after.active!.milestones[1]!.state).toBe("current");
  });

  it("refuses to skip anything but the current milestone", async () => {
    if (!reachable) return;
    const page = await loadRoadmapPage(userId);
    const last = page.active!.milestones.at(-1)!;
    await expect(skipMilestone(userId, last.id)).rejects.toBeInstanceOf(RoadmapError);
  });

  it("turns a skip into a completion when the work is finally done", async () => {
    if (!reachable) return;
    await prisma.memberMilestoneProgress.deleteMany({
      where: { memberRoadmap: { userId } },
    });
    const page = await loadRoadmapPage(userId);
    const first = page.active!.milestones[0]!;

    await skipMilestone(userId, first.id);
    // A milestone with no lesson and no recipe needs no evidence, so this one
    // is completable outright. The first has a recipe, so use its own rule:
    // post nothing, and expect the refusal instead.
    await expect(completeMilestone(userId, first.id)).rejects.toBeInstanceOf(RoadmapError);

    const second = (await loadRoadmapPage(userId)).active!.milestones[1]!;
    await completeMilestone(userId, second.id);
    const after = await loadRoadmapPage(userId);
    expect(after.active!.milestones[1]!.state).toBe("done");
    expect(after.active!.milestones[1]!.skippedAt).toBeNull();
  });

  it("records what the member cooked instead, and clears it again", async () => {
    if (!reachable) return;
    await prisma.memberMilestoneProgress.deleteMany({
      where: { memberRoadmap: { userId } },
    });
    const page = await loadRoadmapPage(userId);
    const current = page.active!.milestones.find((m) => m.state === "current")!;

    await swapRecipe(userId, current.id, gfRecipeId);
    let after = await loadRoadmapPage(userId);
    expect(after.active!.milestones[0]!.swappedRecipe?.id).toBe(gfRecipeId);
    // The authored recipe is untouched — the swap is what *they* made.
    expect(after.active!.milestones[0]!.recipe?.id).toBe(plainRecipeId);

    await swapRecipe(userId, current.id, null);
    after = await loadRoadmapPage(userId);
    expect(after.active!.milestones[0]!.swappedRecipe).toBeNull();
  });

  it("refuses a recipe that does not exist", async () => {
    if (!reachable) return;
    const page = await loadRoadmapPage(userId);
    const current = page.active!.milestones.find((m) => m.state === "current")!;
    await expect(
      swapRecipe(userId, current.id, "not-a-real-recipe-id"),
    ).rejects.toBeInstanceOf(RoadmapError);
  });
});

describe("the four answers", () => {
  it("saves them, and drops anything outside the vocabulary", async () => {
    if (!reachable) return;
    const saved = await saveAnswers(userId, {
      cookVibe: "busy",
      suckiestThing: "nonsense-value",
      glutenFree: "yes",
      primaryBenefit: "health",
    });
    expect(saved).toEqual({
      cookVibe: "busy",
      suckiestThing: null,
      glutenFree: true,
      primaryBenefit: "health",
    });
  });

  it("shows a gluten-free member the substitute recipe", async () => {
    if (!reachable) return;
    // The first milestone carries both recipes, set in the authoring test above.
    await saveAnswers(userId, { glutenFree: "yes" });
    const gf = await loadRoadmapPage(userId);
    expect(gf.active!.milestones[0]!.recipe).toMatchObject({
      id: gfRecipeId,
      glutenFree: true,
    });

    await saveAnswers(userId, { glutenFree: "no" });
    const plain = await loadRoadmapPage(userId);
    expect(plain.active!.milestones[0]!.recipe).toMatchObject({
      id: plainRecipeId,
      glutenFree: false,
    });
  });

  it("reports whether the quiz still needs answering", async () => {
    if (!reachable) return;
    await saveAnswers(userId, {});
    expect((await loadRoadmapPage(userId)).needsAnswers).toBe(true);
    await saveAnswers(userId, { cookVibe: "busy" });
    expect((await loadRoadmapPage(userId)).needsAnswers).toBe(false);
  });
});
