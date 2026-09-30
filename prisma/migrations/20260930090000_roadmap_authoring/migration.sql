-- Roadmap authoring and the two supports §14 asks for (BUILD.md §14).
--
-- Additive only: every column is nullable, so an existing row keeps its
-- meaning and nothing has to be backfilled.
--
-- `skippedAt` is deliberately its own column rather than a flag on
-- `completedAt`. A skip unlocks the next milestone but is not an achievement,
-- and recording it as a completion would have counted it towards streaks and
-- badges that were never earned.

-- AlterTable
ALTER TABLE "RoadmapMilestone" ADD COLUMN     "constraintNote" JSONB,
ADD COLUMN     "framing" JSONB,
ADD COLUMN     "recipeIdGlutenFree" TEXT;

-- AlterTable
ALTER TABLE "MemberMilestoneProgress" ADD COLUMN     "skippedAt" TIMESTAMP(3),
ADD COLUMN     "swappedRecipeId" TEXT;

-- CreateIndex
-- Milestones are always read as one track in order; this is that query.
CREATE INDEX "RoadmapMilestone_trackId_sortOrder_idx" ON "RoadmapMilestone"("trackId", "sortOrder");
