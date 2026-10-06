import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { IdeaError } from "@/lib/ideas/errors";
import { IDEA_LIMITS, ideaLimitKey } from "@/lib/ideas/limits";
import {
  createIdea,
  mergeIdea,
  setIdeaRemoved,
  setIdeaStatus,
  toggleIdeaVote,
  updateIdea,
  withdrawIdea,
} from "@/lib/ideas/mutations";
import {
  findSimilarIdeas,
  getIdeaDetail,
  listIdeas,
  listIdeasForStaff,
} from "@/lib/ideas/queries";
import { reportPost } from "@/lib/community/engagement";
import { renderRichText, richTextToPlain } from "@/lib/content/rich-text";

/**
 * Ideas & Requests against the database (DEC-078).
 *
 * The properties no unit test can prove because they belong to the schema and
 * to concurrent access: one vote per member per idea, a score that always
 * equals the votes, a merge that moves votes without counting anyone twice,
 * and a staff-only door that holds. Needs the local Docker Postgres; skips
 * itself when it is unreachable.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;

const users = { author: "", alice: "", bea: "", staff: "" };
const created: string[] = [];

async function expectIdeaError(work: Promise<unknown>, code: string) {
  const error = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error, `expected IdeaError ${code}`).toBeInstanceOf(IdeaError);
  expect((error as IdeaError).code).toBe(code);
}

const IDEA_BODY = "Something **bold**, and <b>no raw html</b>.";

async function newIdea(userId: string, title: string, category = "CLASS") {
  const { id } = await createIdea({
    userId,
    title: `${title} ${stamp}`,
    body: IDEA_BODY,
    category,
  });
  created.push(id);
  return id;
}

/** The score column, and the votes it is meant to equal. */
async function tally(ideaId: string) {
  const [post, votes] = await Promise.all([
    prisma.post.findUniqueOrThrow({ where: { id: ideaId }, select: { score: true } }),
    prisma.vote.aggregate({ where: { postId: ideaId }, _sum: { value: true }, _count: true }),
  ]);
  return { score: post.score, sum: votes._sum.value ?? 0, rows: votes._count };
}

beforeAll(async () => {
  try {
    await prisma.ideaDetails.count();
  } catch {
    reachable = false;
    return;
  }
  for (const key of Object.keys(users) as (keyof typeof users)[]) {
    const user = await prisma.user.create({
      data: {
        email: `ideas-${stamp}-${key}@example.test`,
        handle: `id${stamp}${key}`.slice(0, 32),
        status: "ACTIVE",
        profile: { create: { displayName: `Ideas ${key}` } },
      },
      select: { id: true },
    });
    users[key] = user.id;
  }
  const admin = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN" },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: users.staff, roleId: admin.id } });
});

beforeEach(async () => {
  if (!reachable) return;
  // The limiter is real and shared; each test starts with a full allowance.
  const ids = Object.values(users);
  await prisma.rateLimitBucket.deleteMany({
    where: {
      key: {
        in: ids.flatMap((id) => [
          ideaLimitKey("submit", id),
          ideaLimitKey("vote", id),
          ideaLimitKey("edit", id),
          ideaLimitKey("lookup", id),
          `community:report:${id}`,
        ]),
      },
    },
  });
});

afterAll(async () => {
  if (reachable) {
    const ids = Object.values(users).filter(Boolean);
    await prisma.searchIndex.deleteMany({ where: { entityType: "post", entityId: { in: created } } });
    await prisma.report.deleteMany({ where: { postId: { in: created } } });
    // Details, votes and mentions cascade with the posts.
    await prisma.post.deleteMany({ where: { id: { in: created } } });
    await prisma.post.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { contains: stamp } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { key: { in: ids.flatMap((id) => [ideaLimitKey("submit", id), ideaLimitKey("vote", id), `community:report:${id}`]) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

describe("submitting", () => {
  it("writes the idea, its details and the author's vote together", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Laminated dough masterclass", "CLASS");

    const post = await prisma.post.findUniqueOrThrow({
      where: { id },
      select: {
        type: true,
        status: true,
        score: true,
        bodyHtml: true,
        plainText: true,
        space: { select: { slug: true } },
        idea: { select: { category: true, status: true, mergedIntoId: true } },
      },
    });
    expect(post.type).toBe("IDEA");
    expect(post.status).toBe("PUBLISHED");
    expect(post.space.slug).toBe("ideas");
    expect(post.idea).toEqual({ category: "CLASS", status: "OPEN", mergedIntoId: null });
    // The author wants it: their vote is counted from the start.
    expect(await tally(id)).toEqual({ score: 1, sum: 1, rows: 1 });
    // The details go through the one rich-text pipeline (C2), so whatever it
    // does about bold and raw HTML, ideas do too.
    expect(post.bodyHtml).toBe(renderRichText(IDEA_BODY));
    expect(post.plainText).toBe(richTextToPlain(IDEA_BODY));
  });

  it("refuses the same title again and points at the original", async ({ skip }) => {
    if (!reachable) skip();
    const original = await newIdea(users.author, "Weeknight ramen bowls");
    const error = await createIdea({
      userId: users.alice,
      title: `  weeknight RAMEN bowls ${stamp}!  `,
      body: "",
      category: "RECIPE",
    }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(IdeaError);
    expect((error as IdeaError).code).toBe("duplicate");
    expect((error as IdeaError).existing?.id).toBe(original);
  });

  it("validates the title and the kind", async ({ skip }) => {
    if (!reachable) skip();
    await expectIdeaError(
      createIdea({ userId: users.alice, title: "Hi", body: "", category: "CLASS" }),
      "invalid",
    );
    await expectIdeaError(
      createIdea({ userId: users.alice, title: `A real title ${stamp}`, body: "", category: "SNACK" }),
      "invalid",
    );
  });

  it("shows near matches while a title is typed", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Vegan croissants at home");
    const similar = await findSimilarIdeas({
      viewerId: users.alice,
      title: `Croissant class please ${stamp}`,
    });
    expect(similar.map((idea) => idea.id)).toContain(id);
    const match = similar.find((idea) => idea.id === id)!;
    expect(match.voted).toBe(false);
    expect(match.voteBlock).toBeNull();
  });

  it("rate limits submissions", async ({ skip }) => {
    if (!reachable) skip();
    await prisma.rateLimitBucket.upsert({
      where: { key: ideaLimitKey("submit", users.bea) },
      create: {
        key: ideaLimitKey("submit", users.bea),
        count: IDEA_LIMITS.submit.limit,
        resetAt: new Date(Date.now() + 60_000),
      },
      update: { count: IDEA_LIMITS.submit.limit, resetAt: new Date(Date.now() + 60_000) },
    });
    const before = await prisma.post.count({ where: { authorId: users.bea } });
    await expectIdeaError(
      createIdea({ userId: users.bea, title: `One idea too many ${stamp}`, body: "", category: "OTHER" }),
      "rate_limited",
    );
    expect(await prisma.post.count({ where: { authorId: users.bea } })).toBe(before);
  });
});

describe("voting", () => {
  it("allows one vote per member, and a second press takes it back", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Tempeh from scratch");

    expect(await toggleIdeaVote({ userId: users.alice, ideaId: id })).toEqual({
      voted: true,
      score: 2,
    });
    expect(await tally(id)).toEqual({ score: 2, sum: 2, rows: 2 });

    expect(await toggleIdeaVote({ userId: users.alice, ideaId: id })).toEqual({
      voted: false,
      score: 1,
    });
    expect(await tally(id)).toEqual({ score: 1, sum: 1, rows: 1 });
    expect(await prisma.vote.count({ where: { postId: id, userId: users.alice } })).toBe(0);
  });

  it("does not let the author vote on their own idea", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Seitan that is not rubbery");
    await expectIdeaError(toggleIdeaVote({ userId: users.author, ideaId: id }), "own");
    expect(await tally(id)).toEqual({ score: 1, sum: 1, rows: 1 });
  });

  it("keeps the score equal to the votes when presses overlap", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Fermented hot sauce");

    await Promise.all([
      toggleIdeaVote({ userId: users.alice, ideaId: id }),
      toggleIdeaVote({ userId: users.bea, ideaId: id }),
      toggleIdeaVote({ userId: users.staff, ideaId: id }),
    ]);
    expect(await tally(id)).toEqual({ score: 4, sum: 4, rows: 4 });

    // A double tap is two toggles, applied one after the other: off, then on.
    await Promise.all([
      toggleIdeaVote({ userId: users.alice, ideaId: id }),
      toggleIdeaVote({ userId: users.alice, ideaId: id }),
    ]);
    const after = await tally(id);
    expect(after.score).toBe(after.sum);
    expect(after.rows).toBe(4);
    expect(await prisma.vote.count({ where: { postId: id, userId: users.alice } })).toBe(1);
  });

  it("counts upvotes only, so a stray downvote cannot bury an idea", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Plant-based charcuterie board");
    // What the generic post vote would have written before ideas existed.
    await prisma.vote.create({ data: { userId: users.bea, postId: id, value: -1 } });

    expect((await toggleIdeaVote({ userId: users.alice, ideaId: id })).score).toBe(2);
    // Bea's press turns her stray downvote into the upvote she meant.
    expect(await toggleIdeaVote({ userId: users.bea, ideaId: id })).toEqual({
      voted: true,
      score: 3,
    });
    expect(await prisma.vote.count({ where: { postId: id, value: { lt: 0 } } })).toBe(0);
  });

  it("closes voting on done and declined ideas, and opens it again", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Oil-free baking");
    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "DONE" });
    await expectIdeaError(toggleIdeaVote({ userId: users.alice, ideaId: id }), "closed");

    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "DECLINED" });
    await expectIdeaError(toggleIdeaVote({ userId: users.alice, ideaId: id }), "closed");

    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "OPEN" });
    expect((await toggleIdeaVote({ userId: users.alice, ideaId: id })).voted).toBe(true);
  });

  it("rate limits votes", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Pressure cooker beans");
    await prisma.rateLimitBucket.upsert({
      where: { key: ideaLimitKey("vote", users.bea) },
      create: {
        key: ideaLimitKey("vote", users.bea),
        count: IDEA_LIMITS.vote.limit,
        resetAt: new Date(Date.now() + 60_000),
      },
      update: { count: IDEA_LIMITS.vote.limit, resetAt: new Date(Date.now() + 60_000) },
    });
    await expectIdeaError(toggleIdeaVote({ userId: users.bea, ideaId: id }), "rate_limited");
    expect(await tally(id)).toEqual({ score: 1, sum: 1, rows: 1 });
  });
});

describe("merging a duplicate", () => {
  it("moves its votes to the original without counting anyone twice", async ({ skip }) => {
    if (!reachable) skip();
    // The original: the author's own vote, and Bea's.
    const original = await newIdea(users.author, "Japanese curry night");
    await toggleIdeaVote({ userId: users.bea, ideaId: original });
    // The duplicate: Alice asked again; Bea and the author voted on it too.
    const duplicate = await newIdea(users.alice, "Katsu curry recipe");
    await toggleIdeaVote({ userId: users.bea, ideaId: duplicate });
    await toggleIdeaVote({ userId: users.author, ideaId: duplicate });
    expect((await tally(original)).score).toBe(2);
    expect((await tally(duplicate)).score).toBe(3);

    const result = await mergeIdea({
      staffId: users.staff,
      sourceId: duplicate,
      targetId: original,
      note: "Asked for already.",
    });
    // Alice's vote moves; Bea's and the author's were already counted.
    expect(result).toEqual({ moved: 1, dropped: 2, targetScore: 3 });
    expect(await tally(original)).toEqual({ score: 3, sum: 3, rows: 3 });
    expect(await tally(duplicate)).toEqual({ score: 0, sum: 0, rows: 0 });
    const voters = await prisma.vote.findMany({ where: { postId: original }, select: { userId: true } });
    expect(new Set(voters.map((vote) => vote.userId))).toEqual(
      new Set([users.author, users.bea, users.alice]),
    );

    const details = await prisma.ideaDetails.findUniqueOrThrow({ where: { postId: duplicate } });
    expect(details.mergedIntoId).toBe(original);

    // The duplicate leaves the board and closes to votes; Alice is told.
    await expectIdeaError(toggleIdeaVote({ userId: users.staff, ideaId: duplicate }), "merged");
    const board = await listIdeas({
      viewerId: users.bea,
      sort: "new",
      category: null,
      status: "all",
      page: 1,
    });
    expect(board.items.map((idea) => idea.id)).not.toContain(duplicate);
    expect(
      await prisma.notification.count({
        where: { userId: users.alice, dedupeKey: `idea-merged:${duplicate}` },
      }),
    ).toBe(1);
    const view = await getIdeaDetail(users.bea, duplicate);
    expect(view?.mergedInto?.id).toBe(original);
    expect(view?.voteBlock).toBe("merged");
    expect((await getIdeaDetail(users.bea, original))?.mergedFrom.map((item) => item.id)).toContain(
      duplicate,
    );
  });

  it("refuses to merge an idea into itself or into a merged duplicate", async ({ skip }) => {
    if (!reachable) skip();
    const a = await newIdea(users.author, "Sourdough discard ideas");
    const b = await newIdea(users.alice, "Discard crackers");
    const c = await newIdea(users.bea, "Starter maintenance tips");
    await expectIdeaError(
      mergeIdea({ staffId: users.staff, sourceId: a, targetId: a }),
      "same",
    );
    await mergeIdea({ staffId: users.staff, sourceId: b, targetId: a });
    await expectIdeaError(
      mergeIdea({ staffId: users.staff, sourceId: c, targetId: b }),
      "target_merged",
    );
    await expectIdeaError(
      mergeIdea({ staffId: users.staff, sourceId: b, targetId: c }),
      "merged",
    );
  });
});

describe("staff decisions", () => {
  it("are refused to anyone who is not staff", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Smoked tofu");
    const other = await newIdea(users.bea, "Tofu smoking at home");
    await expectIdeaError(
      setIdeaStatus({ staffId: users.alice, ideaId: id, status: "PLANNED" }),
      "forbidden",
    );
    await expectIdeaError(
      mergeIdea({ staffId: users.author, sourceId: other, targetId: id }),
      "forbidden",
    );
    await expectIdeaError(
      setIdeaRemoved({ staffId: users.alice, ideaId: id, removed: true }),
      "forbidden",
    );
    const details = await prisma.ideaDetails.findUniqueOrThrow({ where: { postId: id } });
    expect(details.status).toBe("OPEN");
    expect(await prisma.post.findUniqueOrThrow({ where: { id }, select: { status: true } })).toEqual({
      status: "PUBLISHED",
    });
  });

  it("tell the author, tell voters when it is planned, and leave an audit row", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Holiday roast centrepiece");
    await toggleIdeaVote({ userId: users.bea, ideaId: id });

    const first = await setIdeaStatus({
      staffId: users.staff,
      ideaId: id,
      status: "PLANNED",
      note: "Filming in November.",
    });
    expect(first.changed).toBe(true);
    const details = await prisma.ideaDetails.findUniqueOrThrow({ where: { postId: id } });
    expect(details).toMatchObject({
      status: "PLANNED",
      statusNote: "Filming in November.",
      statusUpdatedBy: users.staff,
    });

    const authorNote = await prisma.notification.findFirst({
      where: { userId: users.author, dedupeKey: `idea-status:${id}:PLANNED` },
    });
    expect(authorNote?.category).toBe("REPLIES");
    expect(authorNote?.href).toBe(`/ideas/${id}`);
    expect(authorNote?.body).toContain("Filming in November.");
    const voterNote = await prisma.notification.findFirst({
      where: { userId: users.bea, dedupeKey: `idea-status-voter:${id}:PLANNED` },
    });
    expect(voterNote?.category).toBe("HOST_ANNOUNCEMENTS");
    // Nobody is told about their own action.
    expect(
      await prisma.notification.count({
        where: { userId: users.staff, dedupeKey: { startsWith: `idea-status` } },
      }),
    ).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: users.staff, action: "idea.status_changed", targetId: id },
    });
    expect(audit?.metadata).toMatchObject({ from: "OPEN", to: "PLANNED" });

    // The same status again is a note edit: nobody is notified twice.
    const second = await setIdeaStatus({
      staffId: users.staff,
      ideaId: id,
      status: "PLANNED",
      note: "Filming moved to December.",
    });
    expect(second.changed).toBe(false);
    expect(
      await prisma.notification.count({
        where: { userId: users.author, dedupeKey: `idea-status:${id}:PLANNED` },
      }),
    ).toBe(1);
  });

  it("take an idea off the board, and put it back", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Spammy idea to remove");
    await setIdeaRemoved({ staffId: users.staff, ideaId: id, removed: true });

    const board = await listIdeas({
      viewerId: users.alice,
      sort: "new",
      category: null,
      status: "all",
      page: 1,
    });
    expect(board.items.map((idea) => idea.id)).not.toContain(id);
    expect(await getIdeaDetail(users.alice, id)).toBeNull();
    // Its author can still see what happened to it.
    expect((await getIdeaDetail(users.author, id))?.visibility).toBe("REMOVED");
    await expectIdeaError(toggleIdeaVote({ userId: users.alice, ideaId: id }), "gone");
    const console = await listIdeasForStaff({ filter: "removed", sort: "new", page: 1 });
    expect(console.rows.map((row) => row.id)).toContain(id);

    await setIdeaRemoved({ staffId: users.staff, ideaId: id, removed: false });
    expect(await getIdeaDetail(users.alice, id)).not.toBeNull();
  });
});

describe("the author's own idea", () => {
  it("can be edited while open, and not once the team has picked it up", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Cashew cheese wheel");
    await updateIdea({
      userId: users.author,
      ideaId: id,
      title: `Cashew cheese wheels, aged ${stamp}`,
      body: "Like a real *camembert*.",
      category: "RECIPE",
    });
    const post = await prisma.post.findUniqueOrThrow({
      where: { id },
      select: { title: true, editedAt: true, idea: { select: { category: true } } },
    });
    expect(post.title).toBe(`Cashew cheese wheels, aged ${stamp}`);
    expect(post.editedAt).not.toBeNull();
    expect(post.idea?.category).toBe("RECIPE");

    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "UNDER_REVIEW" });
    await expectIdeaError(
      updateIdea({ userId: users.author, ideaId: id, title: "Something else entirely", body: "", category: "RECIPE" }),
      "locked",
    );
    await expectIdeaError(
      updateIdea({ userId: users.alice, ideaId: id, title: "Hijacked idea title", body: "", category: "RECIPE" }),
      "locked",
    );
  });

  it("can be withdrawn only until someone else joins in", async ({ skip }) => {
    if (!reachable) skip();
    const lonely = await newIdea(users.author, "Idea nobody wanted");
    await withdrawIdea({ userId: users.author, ideaId: lonely });
    expect(await prisma.post.findUnique({ where: { id: lonely } })).toBeNull();

    const popular = await newIdea(users.author, "Idea somebody wanted");
    await toggleIdeaVote({ userId: users.alice, ideaId: popular });
    await expectIdeaError(withdrawIdea({ userId: users.author, ideaId: popular }), "in_use");
    await expectIdeaError(withdrawIdea({ userId: users.alice, ideaId: popular }), "forbidden");
  });

  it("can be reported like any post", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea(users.author, "Reported idea");
    expect(await reportPost({ userId: users.alice, postId: id, reason: "spam" })).toEqual({
      filed: true,
    });
    expect(await reportPost({ userId: users.alice, postId: id, reason: "spam" })).toEqual({
      filed: false,
    });
    const report = await prisma.report.findFirstOrThrow({ where: { postId: id } });
    expect(report.subjectUserId).toBe(users.author);
  });
});
