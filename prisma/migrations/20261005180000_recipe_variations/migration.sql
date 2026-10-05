-- AlterTable. The table is empty in every environment — nothing has ever
-- written a RecipeVariation, because the feature did not exist — so authorId
-- can be required outright with no backfill.
ALTER TABLE "RecipeVariation" ADD COLUMN     "authorId" TEXT NOT NULL,
ADD COLUMN     "veganFlags" JSONB,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Reaction" ADD COLUMN     "variationId" TEXT;

-- CreateTable
CREATE TABLE "RecipeVariationTest" (
    "id" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVariationTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeVariation_recipeId_status_idx" ON "RecipeVariation"("recipeId", "status");
CREATE INDEX "RecipeVariation_status_createdAt_idx" ON "RecipeVariation"("status", "createdAt");
CREATE INDEX "RecipeVariation_authorId_idx" ON "RecipeVariation"("authorId");
CREATE INDEX "RecipeVariationTest_variationId_idx" ON "RecipeVariationTest"("variationId");
CREATE UNIQUE INDEX "RecipeVariationTest_variationId_userId_key" ON "RecipeVariationTest"("variationId", "userId");
CREATE UNIQUE INDEX "Reaction_userId_variationId_emoji_key" ON "Reaction"("userId", "variationId", "emoji");

-- AddForeignKey
ALTER TABLE "RecipeVariation" ADD CONSTRAINT "RecipeVariation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeVariationTest" ADD CONSTRAINT "RecipeVariationTest_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "RecipeVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeVariationTest" ADD CONSTRAINT "RecipeVariationTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "RecipeVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
