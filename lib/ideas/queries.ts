import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getIdeasSpaceId } from "@/lib/community/system-spaces";
import { getUserAuth } from "@/lib/community/viewer";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { canEnterSpace, canModerateSpace, isStaff } from "@/lib/permissions";
import {
  IDEAS_PAGE_SIZE,
  statusesForFilter,
  type AdminIdeaFilter,
  type AdminIdeaSort,
  type IdeaCategoryValue,
  type IdeaSort,
  type IdeaStatusFilter,
  type IdeaStatusValue,
} from "@/lib/ideas/constants";
import {
  canEditIdea,
  canWithdrawIdea,
  ideaVoteBlock,
  type VoteBlock,
} from "@/lib/ideas/rules";
import {
  ideaTitleKey,
  ideaTokens,
  normalizeIdeaTitle,
  rankSimilar,
  trigramQuery,
} from "@/lib/ideas/similarity";

/**
 * Reading the Ideas board (DEC-078).
 *
 * An idea is a post of type IDEA in the Ideas space with an `IdeaDetails` row
 * beside it. Only published ideas that have not been merged into another are
 * ever listed: a removed or hidden idea (moderation) and a merged duplicate
 * (it points at the original) both drop out of every list here.
 *
 * The vote count is `Post.score`, kept equal to the idea's votes by every
 * write in `mutations.ts`, so the board orders by an indexed column rather
 * than counting votes on read.
 */

export type IdeaAuthor = { handle: string; name: string; avatarUrl: string | null };

const AUTHOR_SELECT = {
  handle: true,
  name: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;

type AuthorRow = Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;

function toAuthor(user: AuthorRow): IdeaAuthor {
  return {
    handle: user.handle,
    name: user.profile?.displayName ?? user.name ?? user.handle,
    avatarUrl: resolveMemberAvatar(
      user.handle,
      user.profile?.avatarUrl,
      user.profile?.displayName,
    ),
  };
}

function excerpt(plainText: string, limit = 180): string {
  const text = plainText.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** The ideas every list may show: live, and not folded into another. */
function boardWhere(
  spaceId: string,
  idea: Prisma.IdeaDetailsWhereInput = {},
): Prisma.PostWhereInput {
  return {
    spaceId,
    type: "IDEA",
    status: "PUBLISHED",
    idea: { is: { mergedIntoId: null, ...idea } },
  };
}

/** Whether this member may read the board at all (active, and allowed in). */
async function viewerMayRead(viewerId: string, spaceId: string): Promise<boolean> {
  const [auth, space, membership] = await Promise.all([
    getUserAuth(viewerId),
    prisma.space.findUnique({
      where: { id: spaceId },
      select: {
        visibility: true,
        postingPermission: true,
        productId: true,
        approvalRequired: true,
        hostUserId: true,
      },
    }),
    prisma.spaceMembership.findUnique({
      where: { spaceId_userId: { spaceId, userId: viewerId } },
      select: { role: true },
    }),
  ]);
  if (!auth || !space) return false;
  return canEnterSpace(auth, space, membership ? { role: membership.role } : null);
}

/* ------------------------------------------------------------------------ */
/* The board                                                                */
/* ------------------------------------------------------------------------ */

export type IdeaListItem = {
  id: string;
  title: string;
  excerpt: string;
  score: number;
  commentCount: number;
  publishedAt: Date;
  category: IdeaCategoryValue;
  status: IdeaStatusValue;
  author: IdeaAuthor;
  voted: boolean;
  voteBlock: VoteBlock | null;
};

export type IdeaListPage = {
  allowed: boolean;
  items: IdeaListItem[];
  total: number;
  page: number;
  pageCount: number;
};

const listSelect = (viewerId: string) =>
  ({
    id: true,
    title: true,
    plainText: true,
    score: true,
    commentCount: true,
    publishedAt: true,
    createdAt: true,
    authorId: true,
    author: { select: AUTHOR_SELECT },
    idea: { select: { category: true, status: true, mergedIntoId: true } },
    votes: { where: { userId: viewerId }, select: { value: true } },
  }) satisfies Prisma.PostSelect;

type ListRow = Prisma.PostGetPayload<{ select: ReturnType<typeof listSelect> }>;

function toListItem(row: ListRow, viewerId: string): IdeaListItem {
  const idea = row.idea!;
  return {
    id: row.id,
    title: row.title ?? "Untitled idea",
    excerpt: excerpt(row.plainText),
    score: row.score,
    commentCount: row.commentCount,
    publishedAt: row.publishedAt ?? row.createdAt,
    category: idea.category,
    status: idea.status,
    author: toAuthor(row.author),
    voted: (row.votes[0]?.value ?? 0) > 0,
    voteBlock: ideaVoteBlock({
      isAuthor: row.authorId === viewerId,
      status: idea.status,
      merged: Boolean(idea.mergedIntoId),
    }),
  };
}

export async function listIdeas(input: {
  viewerId: string;
  sort: IdeaSort;
  category: IdeaCategoryValue | null;
  status: IdeaStatusFilter;
  page: number;
}): Promise<IdeaListPage> {
  const spaceId = await getIdeasSpaceId();
  if (!(await viewerMayRead(input.viewerId, spaceId))) {
    return { allowed: false, items: [], total: 0, page: 1, pageCount: 1 };
  }

  // "Planned" is a view of its own: what is on the way, most wanted first.
  const statuses: IdeaStatusValue[] | null =
    input.sort === "planned" ? ["PLANNED"] : statusesForFilter(input.status);
  const where = boardWhere(spaceId, {
    ...(input.category ? { category: input.category } : {}),
    ...(statuses ? { status: { in: statuses } } : {}),
  });
  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    input.sort === "new"
      ? [{ publishedAt: "desc" }, { id: "desc" }]
      : [{ score: "desc" }, { publishedAt: "desc" }, { id: "desc" }];

  const total = await prisma.post.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / IDEAS_PAGE_SIZE));
  const page = Math.min(Math.max(1, input.page), pageCount);
  const rows = await prisma.post.findMany({
    where,
    orderBy,
    skip: (page - 1) * IDEAS_PAGE_SIZE,
    take: IDEAS_PAGE_SIZE,
    select: listSelect(input.viewerId),
  });

  return {
    allowed: true,
    items: rows.map((row) => toListItem(row, input.viewerId)),
    total,
    page,
    pageCount,
  };
}

/** What is on the way, for the board's side rail. */
export async function listPlannedIdeas(viewerId: string, take = 5): Promise<IdeaListItem[]> {
  const spaceId = await getIdeasSpaceId();
  if (!(await viewerMayRead(viewerId, spaceId))) return [];
  const rows = await prisma.post.findMany({
    where: boardWhere(spaceId, { status: "PLANNED" }),
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take,
    select: listSelect(viewerId),
  });
  return rows.map((row) => toListItem(row, viewerId));
}

/* ------------------------------------------------------------------------ */
/* One idea                                                                 */
/* ------------------------------------------------------------------------ */

export type IdeaDetail = {
  id: string;
  title: string;
  body: string;
  score: number;
  commentCount: number;
  publishedAt: Date;
  editedAt: Date | null;
  /** The post's own status: PUBLISHED, or REMOVED/HIDDEN for the author and staff. */
  visibility: "PUBLISHED" | "REMOVED" | "HIDDEN" | "OTHER";
  category: IdeaCategoryValue;
  status: IdeaStatusValue;
  statusNote: string | null;
  statusUpdatedAt: Date | null;
  statusUpdatedBy: string | null;
  author: IdeaAuthor;
  isAuthor: boolean;
  voted: boolean;
  voteBlock: VoteBlock | null;
  mergedInto: { id: string; title: string; live: boolean } | null;
  mergedFrom: { id: string; title: string }[];
  canEdit: boolean;
  canWithdraw: boolean;
  isStaff: boolean;
};

/**
 * One idea, as this member may see it, or null.
 *
 * Null for "not found" and "not yours to see" alike, as for posts. A removed
 * idea stays readable to its author and to staff, with a notice, so the author
 * can see what happened to it.
 */
export async function getIdeaDetail(viewerId: string, ideaId: string): Promise<IdeaDetail | null> {
  const [auth, post] = await Promise.all([
    getUserAuth(viewerId),
    prisma.post.findUnique({
      where: { id: ideaId },
      select: {
        id: true,
        type: true,
        spaceId: true,
        authorId: true,
        status: true,
        title: true,
        body: true,
        score: true,
        commentCount: true,
        publishedAt: true,
        createdAt: true,
        editedAt: true,
        author: { select: AUTHOR_SELECT },
        space: {
          select: {
            visibility: true,
            postingPermission: true,
            productId: true,
            approvalRequired: true,
            hostUserId: true,
          },
        },
        idea: {
          select: {
            category: true,
            status: true,
            statusNote: true,
            statusUpdatedAt: true,
            statusUpdatedBy: true,
            mergedIntoId: true,
          },
        },
        votes: { where: { userId: viewerId }, select: { value: true } },
      },
    }),
  ]);
  if (!auth || !post || post.type !== "IDEA" || !post.idea) return null;

  const membershipRow = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: post.spaceId, userId: viewerId } },
    select: { role: true },
  });
  const membership = membershipRow ? { role: membershipRow.role } : null;
  if (!canEnterSpace(auth, post.space, membership)) return null;
  const canModerate = canModerateSpace(auth, membership);
  const isAuthor = post.authorId === viewerId;
  if (post.status !== "PUBLISHED" && !isAuthor && !canModerate) return null;

  const idea = post.idea;
  const [target, mergedFrom, updater, otherVotes] = await Promise.all([
    idea.mergedIntoId
      ? prisma.post.findUnique({
          where: { id: idea.mergedIntoId },
          select: { id: true, title: true, status: true },
        })
      : null,
    prisma.ideaDetails.findMany({
      where: { mergedIntoId: post.id, post: { is: { status: "PUBLISHED" } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { post: { select: { id: true, title: true } } },
    }),
    idea.statusUpdatedBy
      ? prisma.user.findUnique({ where: { id: idea.statusUpdatedBy }, select: AUTHOR_SELECT })
      : null,
    prisma.vote.count({
      where: { postId: post.id, value: { gt: 0 }, userId: { not: post.authorId } },
    }),
  ]);

  const staff = isStaff(auth);
  const merged = Boolean(idea.mergedIntoId);
  return {
    id: post.id,
    title: post.title ?? "Untitled idea",
    body: post.body,
    score: post.score,
    commentCount: post.commentCount,
    publishedAt: post.publishedAt ?? post.createdAt,
    editedAt: post.editedAt,
    visibility:
      post.status === "PUBLISHED" || post.status === "REMOVED" || post.status === "HIDDEN"
        ? post.status
        : "OTHER",
    category: idea.category,
    status: idea.status,
    statusNote: idea.statusNote,
    statusUpdatedAt: idea.statusUpdatedAt,
    statusUpdatedBy: updater ? toAuthor(updater).name : null,
    author: toAuthor(post.author),
    isAuthor,
    voted: (post.votes[0]?.value ?? 0) > 0,
    voteBlock:
      post.status === "PUBLISHED"
        ? ideaVoteBlock({ isAuthor, status: idea.status, merged })
        : "closed",
    mergedInto: target
      ? {
          id: target.id,
          title: target.title ?? "another idea",
          live: target.status === "PUBLISHED",
        }
      : null,
    mergedFrom: mergedFrom.map((row) => ({
      id: row.post.id,
      title: row.post.title ?? "Untitled idea",
    })),
    canEdit:
      post.status === "PUBLISHED" &&
      canEditIdea({ isAuthor, isStaff: staff, status: idea.status, merged }),
    canWithdraw:
      post.status === "PUBLISHED" &&
      canWithdrawIdea({
        isAuthor,
        status: idea.status,
        merged,
        otherVotes,
        comments: post.commentCount,
        mergedFrom: mergedFrom.length,
      }),
    isStaff: staff,
  };
}

/* ------------------------------------------------------------------------ */
/* "Has someone asked for this already?"                                    */
/* ------------------------------------------------------------------------ */

type Candidate = {
  id: string;
  title: string;
  score: number;
  commentCount: number;
  status: IdeaStatusValue;
  category: IdeaCategoryValue;
  authorId: string;
  trigram: number;
};

/**
 * Ideas whose titles might be the same request, ranked roughly by Postgres.
 *
 * A broad net: any trigram resemblance to the topic words, or any topic word
 * appearing in the title. `rankSimilar` then decides what is close enough to
 * show. If pg_trgm is unavailable the net falls back to the topic words alone
 * rather than failing the form.
 */
async function similarCandidates(
  spaceId: string,
  title: string,
  excludeId?: string | null,
): Promise<Candidate[]> {
  const query = trigramQuery(title);
  const tokens = ideaTokens(title).slice(0, 6);
  if (!query || tokens.length === 0) return [];

  // Tokens are [a-z0-9] only, so they carry nothing LIKE treats specially.
  const likes = tokens.map((token) => Prisma.sql`p."title" ILIKE ${`%${token}%`}`);
  const exclude = excludeId ? Prisma.sql`AND p."id" <> ${excludeId}` : Prisma.empty;

  type Row = Omit<Candidate, "trigram"> & { trigram: number | null };
  const normalise = (rows: Row[]): Candidate[] =>
    rows.map((row) => ({ ...row, score: Number(row.score), trigram: Number(row.trigram ?? 0) }));

  // `strict_word_similarity` rather than `word_similarity`: the loose form
  // scores a query against any run of letters, so "soup" matched "sourdough"
  // and "bread" matched "breakfast". The strict form compares whole words,
  // which still forgives a typo ("chesecake") without inventing a match.
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT p."id", p."title", p."score", p."commentCount", p."authorId",
             d."status"::text AS "status", d."category"::text AS "category",
             GREATEST(
               similarity(lower(p."title"), ${query}),
               strict_word_similarity(${query}, lower(p."title"))
             )::float8 AS "trigram"
      FROM "Post" p
      JOIN "IdeaDetails" d ON d."postId" = p."id"
      WHERE p."spaceId" = ${spaceId}
        AND p."type" = 'IDEA'
        AND p."status" = 'PUBLISHED'
        AND p."title" IS NOT NULL
        AND d."mergedIntoId" IS NULL
        ${exclude}
        AND (
          similarity(lower(p."title"), ${query}) > 0.2
          OR strict_word_similarity(${query}, lower(p."title")) > 0.3
          OR ${Prisma.join(likes, " OR ")}
        )
      ORDER BY "trigram" DESC, p."score" DESC
      LIMIT 40
    `;
    return normalise(rows);
  } catch {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT p."id", p."title", p."score", p."commentCount", p."authorId",
             d."status"::text AS "status", d."category"::text AS "category",
             0::float8 AS "trigram"
      FROM "Post" p
      JOIN "IdeaDetails" d ON d."postId" = p."id"
      WHERE p."spaceId" = ${spaceId}
        AND p."type" = 'IDEA'
        AND p."status" = 'PUBLISHED'
        AND p."title" IS NOT NULL
        AND d."mergedIntoId" IS NULL
        ${exclude}
        AND (${Prisma.join(likes, " OR ")})
      ORDER BY p."score" DESC
      LIMIT 40
    `;
    return normalise(rows);
  }
}

export type SimilarIdea = {
  id: string;
  title: string;
  score: number;
  commentCount: number;
  status: IdeaStatusValue;
  category: IdeaCategoryValue;
  similarity: number;
  voted: boolean;
  voteBlock: VoteBlock | null;
};

/** Close matches for a title being typed, with this member's vote on each. */
export async function findSimilarIdeas(input: {
  viewerId: string;
  title: string;
  excludeId?: string | null;
  limit?: number;
}): Promise<SimilarIdea[]> {
  const title = normalizeIdeaTitle(input.title).slice(0, 200);
  if (title.length < 3) return [];
  const spaceId = await getIdeasSpaceId();
  if (!(await viewerMayRead(input.viewerId, spaceId))) return [];
  const ranked = rankSimilar(
    title,
    await similarCandidates(spaceId, title, input.excludeId),
    input.limit ?? 5,
  );
  if (ranked.length === 0) return [];

  const mine = await prisma.vote.findMany({
    where: { userId: input.viewerId, postId: { in: ranked.map((row) => row.id) }, value: { gt: 0 } },
    select: { postId: true },
  });
  const voted = new Set(mine.map((row) => row.postId));
  return ranked.map((row) => ({
    id: row.id,
    title: row.title,
    score: row.score,
    commentCount: row.commentCount,
    status: row.status,
    category: row.category,
    similarity: Math.round(row.similarity * 100) / 100,
    voted: voted.has(row.id),
    voteBlock: ideaVoteBlock({
      isAuthor: row.authorId === input.viewerId,
      status: row.status,
      merged: false,
    }),
  }));
}

/**
 * The idea already on the board under this exact title, if any. Case, spacing
 * and punctuation do not make a different request.
 */
export async function findExactDuplicate(input: {
  title: string;
  excludeId?: string | null;
}): Promise<{ id: string; title: string } | null> {
  const title = normalizeIdeaTitle(input.title);
  const key = ideaTitleKey(title);
  if (!key) return null;
  const spaceId = await getIdeasSpaceId();

  const exact = await prisma.post.findFirst({
    where: {
      ...boardWhere(spaceId),
      title: { equals: title, mode: "insensitive" },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, title: true },
  });
  if (exact) return { id: exact.id, title: exact.title ?? title };

  const near = await similarCandidates(spaceId, title, input.excludeId);
  const match = near.find((row) => ideaTitleKey(row.title) === key);
  return match ? { id: match.id, title: match.title } : null;
}

/* ------------------------------------------------------------------------ */
/* The console                                                              */
/* ------------------------------------------------------------------------ */

export type AdminIdeaRow = {
  id: string;
  title: string;
  excerpt: string;
  score: number;
  commentCount: number;
  publishedAt: Date;
  visibility: "PUBLISHED" | "REMOVED" | "HIDDEN" | "OTHER";
  category: IdeaCategoryValue;
  status: IdeaStatusValue;
  statusNote: string | null;
  statusUpdatedAt: Date | null;
  author: IdeaAuthor;
  mergedInto: { id: string; title: string } | null;
};

export type AdminIdeaPage = {
  rows: AdminIdeaRow[];
  counts: Record<AdminIdeaFilter, number>;
  total: number;
  page: number;
  pageCount: number;
};

const STATUS_BY_FILTER: Partial<Record<AdminIdeaFilter, IdeaStatusValue>> = {
  open: "OPEN",
  "under-review": "UNDER_REVIEW",
  planned: "PLANNED",
  done: "DONE",
  declined: "DECLINED",
};

function adminWhere(spaceId: string, filter: AdminIdeaFilter): Prisma.PostWhereInput {
  const status = STATUS_BY_FILTER[filter];
  if (status) return boardWhere(spaceId, { status });
  if (filter === "merged") {
    return {
      spaceId,
      type: "IDEA",
      status: "PUBLISHED",
      idea: { is: { mergedIntoId: { not: null } } },
    };
  }
  if (filter === "removed") {
    return { spaceId, type: "IDEA", status: { in: ["REMOVED", "HIDDEN"] } };
  }
  return { spaceId, type: "IDEA", idea: { isNot: null } };
}

/** Every idea, for staff: any status, merged and removed included. */
export async function listIdeasForStaff(input: {
  filter: AdminIdeaFilter;
  sort: AdminIdeaSort;
  page: number;
}): Promise<AdminIdeaPage> {
  const spaceId = await getIdeasSpaceId();
  const where = adminWhere(spaceId, input.filter);
  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    input.sort === "new"
      ? [{ createdAt: "desc" }, { id: "desc" }]
      : [{ score: "desc" }, { createdAt: "desc" }, { id: "desc" }];

  const [byStatus, merged, removed, all, total] = await Promise.all([
    prisma.ideaDetails.groupBy({
      by: ["status"],
      where: {
        mergedIntoId: null,
        post: { is: { spaceId, type: "IDEA", status: "PUBLISHED" } },
      },
      _count: { _all: true },
    }),
    prisma.post.count({ where: adminWhere(spaceId, "merged") }),
    prisma.post.count({ where: adminWhere(spaceId, "removed") }),
    prisma.post.count({ where: adminWhere(spaceId, "all") }),
    prisma.post.count({ where }),
  ]);

  const statusCount = (status: IdeaStatusValue) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const counts: Record<AdminIdeaFilter, number> = {
    open: statusCount("OPEN"),
    "under-review": statusCount("UNDER_REVIEW"),
    planned: statusCount("PLANNED"),
    done: statusCount("DONE"),
    declined: statusCount("DECLINED"),
    merged,
    removed,
    all,
  };

  const pageCount = Math.max(1, Math.ceil(total / IDEAS_PAGE_SIZE));
  const page = Math.min(Math.max(1, input.page), pageCount);
  const rows = await prisma.post.findMany({
    where,
    orderBy,
    skip: (page - 1) * IDEAS_PAGE_SIZE,
    take: IDEAS_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      plainText: true,
      score: true,
      commentCount: true,
      publishedAt: true,
      createdAt: true,
      status: true,
      author: { select: AUTHOR_SELECT },
      idea: {
        select: {
          category: true,
          status: true,
          statusNote: true,
          statusUpdatedAt: true,
          mergedIntoId: true,
        },
      },
    },
  });

  const targetIds = [
    ...new Set(rows.map((row) => row.idea?.mergedIntoId).filter((id): id is string => Boolean(id))),
  ];
  const targets = targetIds.length
    ? await prisma.post.findMany({
        where: { id: { in: targetIds } },
        select: { id: true, title: true },
      })
    : [];
  const targetTitle = new Map(targets.map((row) => [row.id, row.title ?? "another idea"]));

  return {
    counts,
    total,
    page,
    pageCount,
    rows: rows
      .filter((row) => row.idea)
      .map((row) => {
        const idea = row.idea!;
        return {
          id: row.id,
          title: row.title ?? "Untitled idea",
          excerpt: excerpt(row.plainText, 220),
          score: row.score,
          commentCount: row.commentCount,
          publishedAt: row.publishedAt ?? row.createdAt,
          visibility:
            row.status === "PUBLISHED" || row.status === "REMOVED" || row.status === "HIDDEN"
              ? row.status
              : "OTHER",
          category: idea.category,
          status: idea.status,
          statusNote: idea.statusNote,
          statusUpdatedAt: idea.statusUpdatedAt,
          author: toAuthor(row.author),
          mergedInto: idea.mergedIntoId
            ? {
                id: idea.mergedIntoId,
                title: targetTitle.get(idea.mergedIntoId) ?? "an idea that is gone",
              }
            : null,
        };
      }),
  };
}

export type MergeTarget = {
  id: string;
  title: string;
  score: number;
  status: IdeaStatusValue;
};

/**
 * Where a duplicate could go. With no query, the ideas most like the
 * duplicate itself; with one, a title search (or a pasted idea link).
 */
export async function searchMergeTargets(input: {
  sourceId: string;
  query: string;
}): Promise<MergeTarget[]> {
  const spaceId = await getIdeasSpaceId();
  const query = input.query.trim().slice(0, 200);
  const exclude = { id: { not: input.sourceId } };
  const select = {
    id: true,
    title: true,
    score: true,
    idea: { select: { status: true } },
  } satisfies Prisma.PostSelect;
  type Row = Prisma.PostGetPayload<{ select: typeof select }>;
  const shape = (rows: Row[]): MergeTarget[] =>
    rows
      .filter((row) => row.idea)
      .map((row) => ({
        id: row.id,
        title: row.title ?? "Untitled idea",
        score: row.score,
        status: row.idea!.status,
      }));

  if (!query) {
    const source = await prisma.post.findUnique({
      where: { id: input.sourceId },
      select: { title: true },
    });
    if (!source?.title) return [];
    const ranked = rankSimilar(
      source.title,
      await similarCandidates(spaceId, source.title, input.sourceId),
      8,
    );
    return ranked.map((row) => ({
      id: row.id,
      title: row.title,
      score: row.score,
      status: row.status,
    }));
  }

  // A pasted link to an idea, or its bare id.
  const linked = /(?:\/ideas\/)?([a-z0-9]{20,40})\/?$/i.exec(query)?.[1];
  if (linked && linked !== input.sourceId) {
    const row = await prisma.post.findFirst({
      where: { ...boardWhere(spaceId), id: linked },
      select,
    });
    if (row) return shape([row]);
  }

  const rows = await prisma.post.findMany({
    where: {
      ...boardWhere(spaceId),
      ...exclude,
      title: { contains: query, mode: "insensitive" },
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 8,
    select,
  });
  return shape(rows);
}
