-- CreateEnum
CREATE TYPE "LessonKind" AS ENUM ('VIDEO', 'TEXT', 'AUDIO', 'DOWNLOAD', 'QUIZ', 'LIVE');

-- AlterTable
ALTER TABLE "CourseProgress" ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "CourseSection" ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "audioUid" TEXT,
ADD COLUMN     "chapters" JSONB,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "discussionPostId" TEXT,
ADD COLUMN     "downloadUid" TEXT,
ADD COLUMN     "isPreview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liveAt" TIMESTAMP(3),
ADD COLUMN     "liveUrl" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "kind" DROP DEFAULT;

-- The old column was free text, so nothing stopped a row saying "vidoe". Map
-- the spellings that were actually used and send anything unrecognised to
-- TEXT, which renders its body and cannot be a broken player.
UPDATE "Lesson" SET "kind" = CASE lower("kind")
  WHEN 'video' THEN 'VIDEO'
  WHEN 'text' THEN 'TEXT'
  WHEN 'audio' THEN 'AUDIO'
  WHEN 'download' THEN 'DOWNLOAD'
  WHEN 'resource' THEN 'DOWNLOAD'
  WHEN 'quiz' THEN 'QUIZ'
  WHEN 'reflection' THEN 'QUIZ'
  WHEN 'live' THEN 'LIVE'
  ELSE 'TEXT'
END;

ALTER TABLE "Lesson"
  ALTER COLUMN "kind" TYPE "LessonKind" USING "kind"::"LessonKind",
  ALTER COLUMN "kind" SET DEFAULT 'VIDEO';


-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "furthestSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LessonResponse" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonResponse_userId_updatedAt_idx" ON "LessonResponse"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonResponse_lessonId_userId_key" ON "LessonResponse"("lessonId", "userId");

-- CreateIndex
CREATE INDEX "Course_published_updatedAt_idx" ON "Course"("published", "updatedAt");

-- CreateIndex
CREATE INDEX "CourseProgress_userId_updatedAt_idx" ON "CourseProgress"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CourseSection_courseId_sortOrder_idx" ON "CourseSection"("courseId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_discussionPostId_key" ON "Lesson"("discussionPostId");

-- CreateIndex
CREATE INDEX "Lesson_sectionId_sortOrder_idx" ON "Lesson"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_published_kind_idx" ON "Lesson"("published", "kind");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_updatedAt_idx" ON "LessonProgress"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Resource_courseId_sortOrder_idx" ON "Resource"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Resource_lessonId_sortOrder_idx" ON "Resource"("lessonId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_discussionPostId_fkey" FOREIGN KEY ("discussionPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResponse" ADD CONSTRAINT "LessonResponse_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResponse" ADD CONSTRAINT "LessonResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseProgress" ADD CONSTRAINT "CourseProgress_lastLessonId_fkey" FOREIGN KEY ("lastLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the furthest point reached is at least the last saved position.
UPDATE "LessonProgress" SET "furthestSeconds" = "positionSeconds"
WHERE "furthestSeconds" < "positionSeconds";
