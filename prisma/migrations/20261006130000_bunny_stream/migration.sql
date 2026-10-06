-- Bunny Stream for lesson video (DEC-081). Additive only: four nullable
-- columns and an index. `videoUid` is untouched, so every lesson keeps playing
-- exactly as before until a Bunny video is attached to it.

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "bunnyVideoId" TEXT,
ADD COLUMN     "bunnyVideoStatus" INTEGER,
ADD COLUMN     "bunnyVideoLength" INTEGER,
ADD COLUMN     "bunnySyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lesson_bunnyVideoId_idx" ON "Lesson"("bunnyVideoId");
