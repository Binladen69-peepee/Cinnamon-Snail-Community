-- Space groups, favourites, per-space read state, and pinned resources.
--
-- Purely additive: two new tables, three nullable columns, four indexes.
--
-- NOTE: `prisma migrate diff` also emitted drops for SearchIndex.search_tsv
-- and its three FTS/trigram indexes. Those were created by raw SQL in an
-- earlier migration and are absent from schema.prisma, so Prisma believes
-- they are drift and tries to remove them on every diff. They have been
-- stripped here; removing them would destroy full-text search.

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "SpaceMembership" ADD COLUMN     "favoritedAt" TIMESTAMP(3),
ADD COLUMN     "lastReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SpaceGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceResource" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpaceGroup_slug_key" ON "SpaceGroup"("slug");

-- CreateIndex
CREATE INDEX "SpaceResource_spaceId_sortOrder_idx" ON "SpaceResource"("spaceId", "sortOrder");

-- CreateIndex
CREATE INDEX "Space_groupId_sortOrder_idx" ON "Space"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "SpaceMembership_userId_favoritedAt_idx" ON "SpaceMembership"("userId", "favoritedAt");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SpaceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceResource" ADD CONSTRAINT "SpaceResource_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
