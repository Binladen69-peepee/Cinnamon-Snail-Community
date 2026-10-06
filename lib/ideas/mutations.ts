import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { afterResponse } from "@/lib/after-response";
import { writeAuditLog } from "@/lib/audit";
import { upsertSearchIndex } from "@/lib/search";
import { parseMentions } from "@/lib/community/mentions";
import { getIdeasSpaceId } from "@/lib/community/system-spaces";
import { notifyMentions } from "@/lib/notifications/community";
import { renderRichText, richTextToPlain } from "@/lib/content/rich-text";
import { canEnterSpace } from "@/lib/permissions";
import {
  IDEA_BODY_MAX,
  IDEA_CATEGORY_VALUES,
  IDEA_NOTE_MAX,
  IDEA_STATUS_VALUES,
  IDEA_TITLE_MAX,
  IDEA_TITLE_MIN,
  IDEAS_TITLE,
  type IdeaStatusValue,
} from "@/lib/ideas/constants";
import { IdeaError } from "@/lib/ideas/errors";
import { guardIdeaAction } from "@/lib/ideas/limits";
import { canEditIdea, canWithdrawIdea, ideaVoteBlock, voteBlockMessage } from "@/lib/ideas/rules";
import { normalizeIdeaTitle } from "@/lib/ideas/similarity";
import { loadIdeaGate, requireMember, requireStaff } from "@/lib/ideas/access";
import { findExactDuplicate } from "@/lib/ideas/queries";
import { notifyIdeaMerged, notifyIdeaStatus } from "@/lib/ideas/notify";
import { awardBadgesAfterResponse } from "@/lib/social/badge-triggers";

/**
 * Writing to the Ideas board (DEC-078).
 *
 * Three properties hold everywhere in this file:
 *
 * 1. **One vote per member per idea.** The unique index on (userId, postId) in
 *    `Vote` makes a second row impossible; the code only decides which way a
 *    toggle goes.
 * 2. **The count is the votes.** `Post.score` is recomputed from the idea's
 *    vote rows inside the same transaction that changes them, with the idea's
 *    row locked first, so two members voting at once, a vote racing a merge,
 *    or two merges racing each other cannot leave the number wrong. Recounting
 *    rather than incrementing also heals any drift left by older data.
 * 3. **Every staff decision is attributable**: an audit row, and a
 *    notification to the people it concerns.
 */

/* ------------------------------------------------------------------------ */
/* Validation                                                               */
/* ------------------------------------------------------------------------ */

const ideaSchema = z.object({
  title: z
    .string()
    .transform(normalizeIdeaTitle)
    .pipe(
      z
        .string()
        .min(IDEA_TITLE_MIN, `Give it a title of at least ${IDEA_TITLE_MIN} characters.`)
        .max(IDEA_TITLE_MAX, `Keep the title under ${IDEA_TITLE_MAX} characters.`),
    ),
  body: z
    .string()
    .transform((value) => value.replace(/\r\n/g, "\n").trim())
    .pipe(z.string().max(IDEA_BODY_MAX, `Keep the details under ${IDEA_BODY_MAX} characters.`)),
  category: z.enum(IDEA_CATEGORY_VALUES, { error: "Pick what kind of idea this is." }),
});

export type IdeaInput = z.infer<typeof ideaSchema>;

/** Validates what a member wrote, or throws `invalid` naming the field. */
export function parseIdeaInput(input: {
  title: unknown;
  body: unknown;
  category: unknown;
}): IdeaInput {
  const parsed = ideaSchema.safeParse({
    title: typeof input.title === "string" ? input.title : "",
    body: typeof input.body === "string" ? input.body : "",
    category: input.category,
  });
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path[0];
  throw new IdeaError("invalid", issue?.message ?? "Check what you wrote.", {
    field: field === "title" || field === "body" || field === "category" ? field : undefined,
  });
}

const statusSchema = z.object({
  status: z.enum(IDEA_STATUS_VALUES, { error: "Pick a status." }),
  note: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(IDEA_NOTE_MAX, `Keep the note under ${IDEA_NOTE_MAX} characters.`)),
});

/* ------------------------------------------------------------------------ */
/* Shared pieces                                                            */
/* ------------------------------------------------------------------------ */

type Tx = Prisma.TransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Locks idea rows (in id order, so two writers cannot deadlock) for this transaction. */
async function lockIdeas(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return tx.$queryRaw<
    { id: string; type: string; status: string; authorId: string; title: string | null }[]
  >`
    SELECT "id", "type"::text AS "type", "status"::text AS "status", "authorId", "title"
    FROM "Post"
    WHERE "id" IN (${Prisma.join(sorted)})
    ORDER BY "id"
    FOR UPDATE
  `;
}

/**
 * Sets the idea's score to the number of members who upvoted it, and returns
 * it. Ideas are upvote-only, so a stray downvote row (written by the generic
 * post vote before ideas existed, or by a client calling it directly) counts
 * for nothing rather than pulling a request down.
 */
async function recountScore(tx: Tx, postId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ score: number }[]>`
    UPDATE "Post"
    SET "score" = (
      SELECT COUNT(*)::int FROM "Vote" WHERE "postId" = ${postId} AND "value" > 0
    )
    WHERE "id" = ${postId}
    RETURNING "score"
  `;
  return Number(rows[0]?.score ?? 0);
}

async function indexIdea(input: { id: string; title: string; plainText: string; spaceId: string }) {
  await upsertSearchIndex({
    entityType: "post",
    entityId: input.id,
    title: input.title,
    body: input.plainText,
    spaceId: input.spaceId,
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------------ */
/* Members                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Submits an idea: the IDEA post, its details and the author's own vote, in
 * one transaction, so an idea can never exist without its category and status
 * or with a count that does not match its votes.
 *
 * Refuses an idea that is already on the board under the same title and
 * points at it instead; near matches are the form's job to show, not a reason
 * to refuse.
 */
export async function createIdea(input: {
  userId: string;
  title: unknown;
  body: unknown;
  category: unknown;
}): Promise<{ id: string }> {
  const auth = await requireMember(input.userId);
  const spaceId = await getIdeasSpaceId();
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      visibility: true,
      postingPermission: true,
      productId: true,
      approvalRequired: true,
      hostUserId: true,
    },
  });
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId: input.userId } },
    select: { role: true },
  });
  if (!space || !canEnterSpace(auth, space, membership ? { role: membership.role } : null)) {
    throw new IdeaError("forbidden", `${IDEAS_TITLE} is open to members.`);
  }

  const idea = parseIdeaInput(input);
  // Checked before the allowance is spent: being pointed at the existing idea
  // is help, not a submission.
  const duplicate = await findExactDuplicate({ title: idea.title });
  if (duplicate) {
    throw new IdeaError(
      "duplicate",
      "That idea is already on the board. Add your vote to it instead.",
      { existing: duplicate, field: "title" },
    );
  }
  await guardIdeaAction("submit", input.userId);

  const now = new Date();
  const plainText = richTextToPlain(idea.body);
  const handles = parseMentions(idea.body);

  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        spaceId,
        authorId: input.userId,
        type: "IDEA",
        status: "PUBLISHED",
        title: idea.title,
        body: idea.body,
        bodyHtml: renderRichText(idea.body),
        plainText,
        publishedAt: now,
        lastActivityAt: now,
        // The author's own vote, written just below.
        score: 1,
        mentions: handles.length
          ? { create: handles.map((handle) => ({ handle })) }
          : undefined,
      },
      select: { id: true },
    });
    await tx.ideaDetails.create({
      data: { postId: post.id, category: idea.category, status: "OPEN" },
    });
    await tx.vote.create({ data: { userId: input.userId, postId: post.id, value: 1 } });
    return post;
  });

  const author = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { name: true, handle: true, profile: { select: { displayName: true } } },
  });
  const actorName = author?.profile?.displayName ?? author?.name ?? author?.handle ?? "A member";

  await afterResponse(async () => {
    await indexIdea({ id: created.id, title: idea.title, plainText, spaceId });
    await notifyMentions({
      handles,
      actorId: input.userId,
      actorName,
      spaceName: IDEAS_TITLE,
      href: `/ideas/${created.id}`,
      source: `post:${created.id}`,
    }).catch(() => undefined);
    await writeAuditLog({
      actorId: input.userId,
      action: "idea.created",
      targetType: "post",
      targetId: created.id,
      metadata: { category: idea.category, spaceId },
    }).catch(() => undefined);
  });

  return { id: created.id };
}

/**
 * Adds or takes back this member's upvote.
 *
 * Upvotes only: an idea board ranks what people want, and a downvote would let
 * a handful of members bury a request others are asking for. The author's own
 * vote is fixed, and voting is closed on merged, shipped and declined ideas.
 */
export async function toggleIdeaVote(input: {
  userId: string;
  ideaId: string;
}): Promise<{ voted: boolean; score: number }> {
  const gate = await loadIdeaGate(input.userId, input.ideaId);
  const early = ideaVoteBlock({
    isAuthor: gate.idea.authorId === input.userId,
    status: gate.idea.idea.status,
    merged: Boolean(gate.idea.idea.mergedIntoId),
  });
  if (early) throw new IdeaError(early, voteBlockMessage(early));
  await guardIdeaAction("vote", input.userId);

  try {
    return await prisma.$transaction(async (tx) => {
      const [locked] = await lockIdeas(tx, [input.ideaId]);
      if (!locked || locked.type !== "IDEA" || locked.status !== "PUBLISHED") {
        throw new IdeaError("gone", "That idea is gone.");
      }
      // Re-read under the lock: staff may have closed or merged it meanwhile.
      const details = await tx.ideaDetails.findUnique({
        where: { postId: input.ideaId },
        select: { status: true, mergedIntoId: true },
      });
      if (!details) throw new IdeaError("gone", "That idea is gone.");
      const block = ideaVoteBlock({
        isAuthor: locked.authorId === input.userId,
        status: details.status,
        merged: Boolean(details.mergedIntoId),
      });
      if (block) throw new IdeaError(block, voteBlockMessage(block));

      const existing = await tx.vote.findUnique({
        where: { userId_postId: { userId: input.userId, postId: input.ideaId } },
        select: { id: true, value: true },
      });
      let voted: boolean;
      if (existing && existing.value > 0) {
        await tx.vote.delete({ where: { id: existing.id } });
        voted = false;
      } else if (existing) {
        // A stray downvote from before ideas were upvote-only becomes an upvote.
        await tx.vote.update({ where: { id: existing.id }, data: { value: 1 } });
        voted = true;
      } else {
        await tx.vote.create({
          data: { userId: input.userId, postId: input.ideaId, value: 1 },
        });
        voted = true;
      }
      const score = await recountScore(tx, input.ideaId);
      return { voted, score };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A double press raced past the lock through another path; the first one
    // won and the row is right, so report it.
    const [vote, post] = await Promise.all([
      prisma.vote.findUnique({
        where: { userId_postId: { userId: input.userId, postId: input.ideaId } },
        select: { value: true },
      }),
      prisma.post.findUnique({ where: { id: input.ideaId }, select: { score: true } }),
    ]);
    return { voted: (vote?.value ?? 0) > 0, score: post?.score ?? 0 };
  }
}

/**
 * Fixing an idea. The author may while it is still open; staff always may.
 * The same title check as submitting, so an edit cannot turn one idea into an
 * exact copy of another.
 */
export async function updateIdea(input: {
  userId: string;
  ideaId: string;
  title: unknown;
  body: unknown;
  category: unknown;
}): Promise<{ id: string }> {
  const gate = await loadIdeaGate(input.userId, input.ideaId);
  const allowed = canEditIdea({
    isAuthor: gate.idea.authorId === input.userId,
    isStaff: gate.staff,
    status: gate.idea.idea.status,
    merged: Boolean(gate.idea.idea.mergedIntoId),
  });
  if (!allowed) {
    throw new IdeaError(
      "locked",
      gate.idea.authorId === input.userId
        ? "Ideas can be edited while they are open. Add a reply if something needs saying."
        : "Only the author can edit this idea.",
    );
  }

  const idea = parseIdeaInput(input);
  await guardIdeaAction("edit", input.userId);
  const duplicate = await findExactDuplicate({ title: idea.title, excludeId: input.ideaId });
  if (duplicate) {
    throw new IdeaError("duplicate", "Another idea already has that title.", {
      existing: duplicate,
      field: "title",
    });
  }

  const plainText = richTextToPlain(idea.body);
  const handles = parseMentions(idea.body);
  await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: input.ideaId },
      data: {
        title: idea.title,
        body: idea.body,
        bodyHtml: renderRichText(idea.body),
        plainText,
        editedAt: new Date(),
      },
    });
    await tx.postMention.deleteMany({ where: { postId: input.ideaId } });
    if (handles.length) {
      await tx.postMention.createMany({
        data: handles.map((handle) => ({ postId: input.ideaId, handle })),
      });
    }
    await tx.ideaDetails.update({
      where: { postId: input.ideaId },
      data: { category: idea.category },
    });
  });

  await afterResponse(async () => {
    await indexIdea({ id: input.ideaId, title: idea.title, plainText, spaceId: gate.idea.spaceId });
    await writeAuditLog({
      actorId: input.userId,
      action: "idea.edited",
      targetType: "post",
      targetId: input.ideaId,
      metadata: { byStaff: gate.idea.authorId !== input.userId },
    }).catch(() => undefined);
  });
  return { id: input.ideaId };
}

/**
 * The author taking back an idea nobody else has joined. Once another member
 * has voted or replied, it is not only the author's any more.
 */
export async function withdrawIdea(input: { userId: string; ideaId: string }): Promise<void> {
  const gate = await loadIdeaGate(input.userId, input.ideaId);
  if (gate.idea.authorId !== input.userId) {
    throw new IdeaError("forbidden", "Only the author can withdraw an idea.");
  }

  await prisma.$transaction(async (tx) => {
    // One statement at a time: an interactive transaction is one connection.
    await lockIdeas(tx, [input.ideaId]);
    const details = await tx.ideaDetails.findUnique({
      where: { postId: input.ideaId },
      select: { status: true, mergedIntoId: true },
    });
    if (!details) throw new IdeaError("gone", "That idea is gone.");
    const otherVotes = await tx.vote.count({
      where: { postId: input.ideaId, value: { gt: 0 }, userId: { not: input.userId } },
    });
    const comments = await tx.comment.count({ where: { postId: input.ideaId } });
    const mergedFrom = await tx.ideaDetails.count({ where: { mergedIntoId: input.ideaId } });
    const allowed = canWithdrawIdea({
      isAuthor: true,
      status: details.status,
      merged: Boolean(details.mergedIntoId),
      otherVotes,
      comments,
      mergedFrom,
    });
    if (!allowed) {
      throw new IdeaError(
        "in_use",
        "Other members have joined in on this idea, so it stays. Ask the team if it should come down.",
      );
    }
    // Details, votes, mentions and reactions cascade with the post.
    await tx.post.delete({ where: { id: input.ideaId } });
  });

  await afterResponse(async () => {
    await prisma.searchIndex
      .deleteMany({ where: { entityType: "post", entityId: input.ideaId } })
      .catch(() => undefined);
    await writeAuditLog({
      actorId: input.userId,
      action: "idea.withdrawn",
      targetType: "post",
      targetId: input.ideaId,
    }).catch(() => undefined);
  });
}

/* ------------------------------------------------------------------------ */
/* Staff                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Moves an idea along: open, under review, planned, done or declined, with an
 * optional note the members see under the status.
 */
export async function setIdeaStatus(input: {
  staffId: string;
  ideaId: string;
  status: unknown;
  note?: unknown;
}): Promise<{ changed: boolean }> {
  await requireStaff(input.staffId);
  const parsed = statusSchema.safeParse({
    status: input.status,
    note: typeof input.note === "string" ? input.note : "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new IdeaError("invalid", issue?.message ?? "Check the status.", {
      field: issue?.path[0] === "note" ? "note" : "status",
    });
  }
  const status: IdeaStatusValue = parsed.data.status;
  const note = parsed.data.note || null;

  const post = await prisma.post.findUnique({
    where: { id: input.ideaId },
    select: {
      id: true,
      type: true,
      title: true,
      authorId: true,
      idea: { select: { status: true, statusNote: true, mergedIntoId: true } },
    },
  });
  if (!post || post.type !== "IDEA" || !post.idea) {
    throw new IdeaError("gone", "That idea is gone.");
  }
  if (post.idea.mergedIntoId) {
    throw new IdeaError("merged", "This idea was merged into another. Update that one instead.");
  }

  const from = post.idea.status;
  const changed = from !== status;
  if (!changed && (post.idea.statusNote ?? null) === note) return { changed: false };

  await prisma.ideaDetails.update({
    where: { postId: post.id },
    data: {
      status,
      statusNote: note,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: input.staffId,
    },
  });

  await writeAuditLog({
    actorId: input.staffId,
    action: "idea.status_changed",
    targetType: "post",
    targetId: post.id,
    metadata: { from, to: status, note },
  }).catch(() => undefined);

  if (changed) {
    await afterResponse(async () => {
      await notifyIdeaStatus({
        ideaId: post.id,
        ideaTitle: post.title ?? "your idea",
        authorId: post.authorId,
        actorId: input.staffId,
        status,
        note,
      }).catch(() => undefined);
    });
  }
  // The author's "Ideas planned" ladder counts ideas the team marked Planned
  // or Done, so this is the moment it can move. The author's, never staff's.
  if (changed && (status === "PLANNED" || status === "DONE")) {
    await awardBadgesAfterResponse(post.authorId, "idea-planned");
  }
  return { changed };
}

/**
 * Folds a duplicate into the idea that carries the request.
 *
 * Every vote on the duplicate moves to the original, except from members who
 * had already voted on the original, whose duplicate vote is dropped: one
 * member, one vote, however many copies they voted on. The duplicate keeps its
 * conversation and points at the original; it leaves the board.
 */
export async function mergeIdea(input: {
  staffId: string;
  sourceId: string;
  targetId: string;
  note?: unknown;
}): Promise<{ moved: number; dropped: number; targetScore: number }> {
  await requireStaff(input.staffId);
  if (!input.sourceId || !input.targetId) {
    throw new IdeaError("invalid", "Pick the idea to merge into.");
  }
  if (input.sourceId === input.targetId) {
    throw new IdeaError("same", "An idea cannot be merged into itself.");
  }
  const note =
    typeof input.note === "string" ? input.note.replace(/\s+/g, " ").trim().slice(0, IDEA_NOTE_MAX) : "";

  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockIdeas(tx, [input.sourceId, input.targetId]);
    const source = locked.find((row) => row.id === input.sourceId);
    const target = locked.find((row) => row.id === input.targetId);
    if (!source || source.type !== "IDEA") throw new IdeaError("gone", "That idea is gone.");
    if (!target || target.type !== "IDEA" || target.status !== "PUBLISHED") {
      throw new IdeaError("target_gone", "The idea to merge into is not on the board.");
    }

    const sourceDetails = await tx.ideaDetails.findUnique({
      where: { postId: source.id },
      select: { mergedIntoId: true },
    });
    const targetDetails = await tx.ideaDetails.findUnique({
      where: { postId: target.id },
      select: { mergedIntoId: true },
    });
    if (!sourceDetails || !targetDetails) throw new IdeaError("gone", "That idea is gone.");
    if (sourceDetails.mergedIntoId) {
      throw new IdeaError("merged", "That idea has already been merged.");
    }
    if (targetDetails.mergedIntoId) {
      throw new IdeaError(
        "target_merged",
        "That idea was itself merged into another. Merge into that one instead.",
      );
    }

    const sourceVotes = await tx.vote.findMany({
      where: { postId: source.id },
      select: { id: true, userId: true, value: true },
    });
    const already = new Set(
      (
        await tx.vote.findMany({
          where: { postId: target.id, userId: { in: sourceVotes.map((vote) => vote.userId) } },
          select: { userId: true },
        })
      ).map((vote) => vote.userId),
    );
    const movers = sourceVotes.filter((vote) => vote.value > 0 && !already.has(vote.userId));
    if (movers.length) {
      await tx.vote.updateMany({
        where: { id: { in: movers.map((vote) => vote.id) } },
        data: { postId: target.id, value: 1 },
      });
    }
    // What is left on the duplicate is a vote its owner already has on the
    // original (or a stray downvote): counting it again would be the double
    // count this exists to prevent.
    const dropped = await tx.vote.deleteMany({ where: { postId: source.id } });

    await tx.ideaDetails.update({
      where: { postId: source.id },
      data: {
        mergedIntoId: target.id,
        statusNote: note || null,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: input.staffId,
      },
    });

    const targetScore = await recountScore(tx, target.id);
    await recountScore(tx, source.id);
    return {
      moved: movers.length,
      dropped: dropped.count,
      targetScore,
      source: { title: source.title ?? "an idea", authorId: source.authorId },
      target: { title: target.title ?? "an idea" },
    };
  });

  await writeAuditLog({
    actorId: input.staffId,
    action: "idea.merged",
    targetType: "post",
    targetId: input.sourceId,
    metadata: {
      into: input.targetId,
      movedVotes: result.moved,
      droppedDuplicateVotes: result.dropped,
      note: note || null,
    },
  }).catch(() => undefined);

  await afterResponse(async () => {
    await notifyIdeaMerged({
      sourceId: input.sourceId,
      sourceTitle: result.source.title,
      sourceAuthorId: result.source.authorId,
      targetId: input.targetId,
      targetTitle: result.target.title,
      actorId: input.staffId,
    }).catch(() => undefined);
  });

  return { moved: result.moved, dropped: result.dropped, targetScore: result.targetScore };
}

/**
 * Takes an idea off the board, or puts it back. REMOVED rather than deleted,
 * like any moderated post: the record and its votes stay, so a mistake can be
 * undone and a report keeps its evidence.
 */
export async function setIdeaRemoved(input: {
  staffId: string;
  ideaId: string;
  removed: boolean;
}): Promise<void> {
  await requireStaff(input.staffId);
  const post = await prisma.post.findUnique({
    where: { id: input.ideaId },
    select: { id: true, type: true, status: true, authorId: true },
  });
  if (!post || post.type !== "IDEA") throw new IdeaError("gone", "That idea is gone.");

  if (input.removed) {
    if (post.status === "REMOVED") return;
    await prisma.post.update({ where: { id: post.id }, data: { status: "REMOVED" } });
  } else {
    if (post.status !== "REMOVED" && post.status !== "HIDDEN") return;
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "PUBLISHED" },
    });
  }

  await writeAuditLog({
    actorId: input.staffId,
    action: input.removed ? "idea.removed" : "idea.restored",
    targetType: "post",
    targetId: post.id,
    metadata: { authorId: post.authorId, from: post.status },
  }).catch(() => undefined);
}
