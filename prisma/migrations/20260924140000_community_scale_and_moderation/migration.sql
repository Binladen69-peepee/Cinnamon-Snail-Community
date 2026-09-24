-- CreateEnum
CREATE TYPE "SpaceNotificationLevel" AS ENUM ('ALL', 'HIGHLIGHTS', 'NONE');

-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'PENDING';

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_parentId_fkey";

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reactionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sharedFromPostId" TEXT;

-- AlterTable
ALTER TABLE "PostAttachment" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Space" DROP COLUMN "notificationDefaults",
ADD COLUMN     "notificationDefault" "SpaceNotificationLevel" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "SpaceMembership" ADD COLUMN     "notificationLevel" "SpaceNotificationLevel";

-- CreateTable
CREATE TABLE "PostReactionTally" (
    "postId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PostReactionTally_pkey" PRIMARY KEY ("postId","emoji")
);

-- CreateIndex
CREATE INDEX "PostReactionTally_postId_idx" ON "PostReactionTally"("postId");

-- CreateIndex
CREATE INDEX "Comment_postId_parentId_createdAt_idx" ON "Comment"("postId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "PollOption_postId_sortOrder_idx" ON "PollOption"("postId", "sortOrder");

-- CreateIndex
CREATE INDEX "Post_status_lastActivityAt_id_idx" ON "Post"("status", "lastActivityAt", "id");

-- CreateIndex
CREATE INDEX "Post_status_publishedAt_id_idx" ON "Post"("status", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Post_status_score_id_idx" ON "Post"("status", "score", "id");

-- CreateIndex
CREATE INDEX "Post_spaceId_status_lastActivityAt_idx" ON "Post"("spaceId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Post_authorId_status_updatedAt_idx" ON "Post"("authorId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Post_sharedFromPostId_idx" ON "Post"("sharedFromPostId");

-- CreateIndex
CREATE INDEX "PostAttachment_postId_sortOrder_idx" ON "PostAttachment"("postId", "sortOrder");

-- CreateIndex
CREATE INDEX "Reaction_postId_idx" ON "Reaction"("postId");

-- CreateIndex
CREATE INDEX "Reaction_commentId_idx" ON "Reaction"("commentId");

-- Collapse duplicate reports before the unique index goes on. Keeping the
-- earliest of each pair preserves when the community first flagged something.
DELETE FROM "Report" a
USING "Report" b
WHERE a."postId" IS NOT NULL
  AND a."postId" = b."postId"
  AND a."reporterId" = b."reporterId"
  AND (a."createdAt" > b."createdAt" OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_postId_key" ON "Report"("reporterId", "postId");

-- CreateIndex
CREATE INDEX "Space_visibility_idx" ON "Space"("visibility");

-- CreateIndex
CREATE INDEX "Space_productId_idx" ON "Space"("productId");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_sharedFromPostId_fkey" FOREIGN KEY ("sharedFromPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostReactionTally" ADD CONSTRAINT "PostReactionTally_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill
--
-- Every column added above is derived from rows that already exist, so it is
-- filled here rather than left at a default that would be wrong. A feed
-- ordered by lastActivityAt would otherwise show every historical post as
-- having happened at the moment of deployment.
-- ---------------------------------------------------------------------------

-- Activity is the newest of: published, edited, or last commented on.
UPDATE "Post" p
SET "lastActivityAt" = GREATEST(
      COALESCE(p."publishedAt", p."createdAt"),
      p."createdAt",
      COALESCE((SELECT MAX(c."createdAt") FROM "Comment" c WHERE c."postId" = p."id"), p."createdAt")
    );

-- The counts the feed now reads instead of loading the rows themselves.
UPDATE "Post" p
SET "commentCount" = COALESCE((SELECT COUNT(*) FROM "Comment" c WHERE c."postId" = p."id"), 0),
    "reactionCount" = COALESCE((SELECT COUNT(*) FROM "Reaction" r WHERE r."postId" = p."id"), 0);

-- One tally row per emoji per post.
INSERT INTO "PostReactionTally" ("postId", "emoji", "count")
SELECT r."postId", r."emoji", COUNT(*)
FROM "Reaction" r
WHERE r."postId" IS NOT NULL
GROUP BY r."postId", r."emoji";

-- Threads flatten to one level. Anything deeper is re-parented onto its
-- top-level ancestor rather than deleted: the reply still belongs to the
-- conversation, it just stops indenting. Without this, existing grandchild
-- comments would claim depth 1 while pointing at a depth-1 parent.
WITH RECURSIVE ancestry AS (
  SELECT c."id", c."parentId", c."id" AS root
  FROM "Comment" c
  WHERE c."parentId" IS NULL
  UNION ALL
  SELECT c."id", c."parentId", a.root
  FROM "Comment" c
  JOIN ancestry a ON c."parentId" = a."id"
)
UPDATE "Comment" c
SET "parentId" = a.root,
    "depth" = 1
FROM ancestry a
WHERE c."id" = a."id"
  AND c."parentId" IS NOT NULL
  AND a.root <> c."parentId";

-- Everything still holding a parent is a direct reply.
UPDATE "Comment" SET "depth" = 1 WHERE "parentId" IS NOT NULL AND "depth" <> 1;
UPDATE "Comment" SET "depth" = 0 WHERE "parentId" IS NULL AND "depth" <> 0;

-- Attachments keep the order they were created in.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "postId" ORDER BY "id") - 1 AS position
  FROM "PostAttachment"
)
UPDATE "PostAttachment" a
SET "sortOrder" = ordered.position
FROM ordered
WHERE a."id" = ordered."id";
