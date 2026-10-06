import { Prisma, type PrismaClient } from "@prisma/client";
import { analyzeRichText } from "@/lib/content/rich-text";
import { excerptText } from "@/lib/content/excerpt";

/**
 * Re-derives what is stored *from* member-written text, for rows written
 * before the current pipeline (DEC-078, contract C2).
 *
 * `bodyHtml` and `plainText` are copies of `body` put through the renderer at
 * write time. Rows written by the old one kept markdown in `plainText` — which
 * is how members saw `**Ingredients**` in excerpts, notifications and search —
 * and kept member-typed HTML in `bodyHtml`. `body`, the member's own words, is
 * never touched; only the derived columns are recomputed from it:
 *
 * - `Post.bodyHtml` / `Post.plainText`, `Comment.bodyHtml` / `Comment.plainText`;
 * - the search index's copy of them (`SearchIndex.body`, and the title of an
 *   untitled post, which is its opening words);
 * - GIF attachments with no recorded type (`mimeType` set to `image/gif`), and
 *   GIFs recorded as videos (a `<video>` cannot play a GIF).
 *
 * Idempotent: a row is written only when its derived value differs, so a
 * second run writes nothing. Writes go through SQL rather than the Prisma
 * model so `updatedAt` is left alone — this is not an edit, and the drafts
 * list orders by it. Dry run unless `apply` is set.
 */

export type RederiveOptions = {
  /** Write the changes. Without it, only count them. */
  apply: boolean;
  /** Rows read per query. */
  batchSize?: number;
  /** Only these posts, their comments and their attachments (tests, spot fixes). */
  postIds?: string[];
  log?: (line: string) => void;
};

export type RederiveReport = {
  apply: boolean;
  posts: { scanned: number; changed: number };
  comments: { scanned: number; changed: number };
  searchIndex: { changed: number };
  attachments: { changed: number };
  /** A few ids of rows that changed, for spot checks. */
  samples: { posts: string[]; comments: string[] };
};

const SAMPLE_LIMIT = 5;

type PostRow = {
  id: string;
  title: string | null;
  body: string;
  bodyHtml: string | null;
  plainText: string;
};

type CommentRow = { id: string; body: string; bodyHtml: string | null; plainText: string };

/** A GIF by file name, for attachment rows that never recorded a type. */
const GIF_URL_SQL = String.raw`\.gif($|[?#])`;

export async function rederiveRichText(
  prisma: PrismaClient,
  options: RederiveOptions,
): Promise<RederiveReport> {
  const batch = Math.min(Math.max(options.batchSize ?? 200, 1), 1000);
  const log = options.log ?? (() => undefined);
  const scope = options.postIds;
  const report: RederiveReport = {
    apply: options.apply,
    posts: { scanned: 0, changed: 0 },
    comments: { scanned: 0, changed: 0 },
    searchIndex: { changed: 0 },
    attachments: { changed: 0 },
    samples: { posts: [], comments: [] },
  };

  /* ------------------------------------------------------------------ posts */
  let cursor: string | null = null;
  for (;;) {
    const rows: PostRow[] = await prisma.post.findMany({
      where: {
        id: {
          ...(scope ? { in: scope } : {}),
          ...(cursor ? { gt: cursor } : {}),
        },
      },
      orderBy: { id: "asc" },
      take: batch,
      select: { id: true, title: true, body: true, bodyHtml: true, plainText: true },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      report.posts.scanned += 1;
      const content = analyzeRichText(row.body);
      if (content.html !== (row.bodyHtml ?? "") || content.plain !== row.plainText) {
        report.posts.changed += 1;
        if (report.samples.posts.length < SAMPLE_LIMIT) report.samples.posts.push(row.id);
        if (options.apply) {
          await prisma.$executeRaw`
            UPDATE "Post" SET "bodyHtml" = ${content.html}, "plainText" = ${content.plain}
            WHERE "id" = ${row.id}`;
        }
      }
      report.searchIndex.changed += await refreshIndex(prisma, options.apply, {
        entityType: "post",
        entityId: row.id,
        // An untitled post is indexed under its opening words; one with no
        // words (a photo) keeps whatever title it was indexed with.
        title: row.title || excerptText(content.plain, 90) || null,
        body: content.plain,
      });
    }
    cursor = rows[rows.length - 1]!.id;
    log(`posts: ${report.posts.scanned} read, ${report.posts.changed} to change`);
  }

  /* --------------------------------------------------------------- comments */
  cursor = null;
  for (;;) {
    const rows: CommentRow[] = await prisma.comment.findMany({
      where: {
        ...(scope ? { postId: { in: scope } } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: batch,
      select: { id: true, body: true, bodyHtml: true, plainText: true },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      report.comments.scanned += 1;
      const content = analyzeRichText(row.body);
      if (content.html !== (row.bodyHtml ?? "") || content.plain !== row.plainText) {
        report.comments.changed += 1;
        if (report.samples.comments.length < SAMPLE_LIMIT) report.samples.comments.push(row.id);
        if (options.apply) {
          await prisma.$executeRaw`
            UPDATE "Comment" SET "bodyHtml" = ${content.html}, "plainText" = ${content.plain}
            WHERE "id" = ${row.id}`;
        }
      }
      report.searchIndex.changed += await refreshIndex(prisma, options.apply, {
        entityType: "comment",
        entityId: row.id,
        title: "Comment",
        body: content.plain,
      });
    }
    cursor = rows[rows.length - 1]!.id;
    log(`comments: ${report.comments.scanned} read, ${report.comments.changed} to change`);
  }

  /* ------------------------------------------------------------ attachments */
  const inScope = scope?.length ? Prisma.sql`AND "postId" IN (${Prisma.join(scope)})` : Prisma.empty;
  if (options.apply) {
    const typed = await prisma.$executeRaw`
      UPDATE "PostAttachment" SET "mimeType" = 'image/gif'
      WHERE ("mimeType" IS NULL OR "mimeType" = '') AND "url" ~* ${GIF_URL_SQL} ${inScope}`;
    const kinds = await prisma.$executeRaw`
      UPDATE "PostAttachment" SET "kind" = 'image'
      WHERE "kind" = 'video' AND ("mimeType" = 'image/gif' OR "url" ~* ${GIF_URL_SQL}) ${inScope}`;
    report.attachments.changed = typed + kinds;
  } else {
    const [row] = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "PostAttachment"
      WHERE (
        (("mimeType" IS NULL OR "mimeType" = '') AND "url" ~* ${GIF_URL_SQL})
        OR ("kind" = 'video' AND ("mimeType" = 'image/gif' OR "url" ~* ${GIF_URL_SQL}))
      ) ${inScope}`;
    report.attachments.changed = row?.count ?? 0;
  }
  log(`attachments: ${report.attachments.changed} to change`);

  return report;
}

/**
 * Brings one search-index row in line with the text, if the row exists.
 *
 * Never creates one: an entity with no index row is unpublished or removed,
 * and indexing it here would make it findable.
 */
async function refreshIndex(
  prisma: PrismaClient,
  apply: boolean,
  input: {
    entityType: string;
    entityId: string;
    /** Null leaves the indexed title as it is. */
    title: string | null;
    body: string;
  },
): Promise<number> {
  const differs = Prisma.sql`(
    "body" IS DISTINCT FROM ${input.body}
    OR (${input.title}::text IS NOT NULL AND "title" IS DISTINCT FROM ${input.title}::text)
  )`;
  if (apply) {
    return prisma.$executeRaw`
      UPDATE "SearchIndex"
      SET "title" = COALESCE(${input.title}::text, "title"), "body" = ${input.body}
      WHERE "entityType" = ${input.entityType} AND "entityId" = ${input.entityId} AND ${differs}`;
  }
  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "SearchIndex"
    WHERE "entityType" = ${input.entityType} AND "entityId" = ${input.entityId} AND ${differs}`;
  return row?.count ?? 0;
}
