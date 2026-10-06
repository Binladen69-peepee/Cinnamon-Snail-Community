-- Client feedback, 2026-10-06 (DEC-078, DEC-079, DEC-080).
--
-- Strictly additive: new enums, nullable columns or columns with defaults, new
-- tables and indexes. Nothing is dropped, renamed or rewritten, so it is safe
-- to apply to production with the app running, and the previous release keeps
-- working against it. Backfills live in the next migration.
--
-- `prisma migrate diff` also proposed dropping the hand-written search indexes
-- and SearchIndex.search_tsv, and the database-level defaults on Event.slug,
-- Event.updatedAt, Lesson.updatedAt and RecipeVariation.updatedAt. Those exist
-- on purpose (earlier migrations wrote them in raw SQL) and were removed from
-- this file.

-- CreateEnum
CREATE TYPE "IdeaCategory" AS ENUM ('CLASS', 'RECIPE', 'FEATURE', 'OTHER');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'PLANNED', 'DONE', 'DECLINED');

-- CreateEnum
CREATE TYPE "CrewKind" AS ENUM ('COHORT', 'ROADMAP', 'TRAIT', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "CrewMemberSource" AS ENUM ('AUTO', 'OPT_IN');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('MANUAL', 'ZOOM');

-- AlterEnum
-- Added, never used in this migration: a value added by ALTER TYPE cannot be
-- used in the same transaction, and nothing here needs it.
ALTER TYPE "PostType" ADD VALUE 'IDEA';
ALTER TYPE "PostType" ADD VALUE 'BULLETIN';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hostName" TEXT,
ADD COLUMN     "source" "EventSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "zoomHostEmail" TEXT,
ADD COLUMN     "zoomKey" TEXT,
ADD COLUMN     "zoomLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "zoomMeetingId" TEXT,
ADD COLUMN     "zoomOccurrenceId" TEXT,
ADD COLUMN     "zoomSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Happening" ADD COLUMN     "postId" TEXT;

-- AlterTable
ALTER TABLE "MemberCard" ADD COLUMN     "postId" TEXT;

-- AlterTable
ALTER TABLE "MemberRoadmap" ADD COLUMN     "pacingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "topicStartedAt" TIMESTAMP(3),
ADD COLUMN     "weeksPerTopic" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "postId" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "surveySyncedAt" TIMESTAMP(3),
ADD COLUMN     "surveyTraits" JSONB;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "startedAtSource" TEXT;

-- CreateTable
CREATE TABLE "IdeaDetails" (
    "postId" TEXT NOT NULL,
    "category" "IdeaCategory" NOT NULL DEFAULT 'OTHER',
    "status" "IdeaStatus" NOT NULL DEFAULT 'OPEN',
    "statusNote" TEXT,
    "statusUpdatedAt" TIMESTAMP(3),
    "statusUpdatedBy" TEXT,
    "mergedIntoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdeaDetails_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "CourseCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCategoryLink" (
    "courseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCategoryLink_pkey" PRIMARY KEY ("courseId","categoryId")
);

-- CreateTable
CREATE TABLE "ZoomSyncRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "canceled" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "ZoomSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crew" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CrewKind" NOT NULL,
    "ruleKey" TEXT,
    "conversationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "CrewMemberSource" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaDetails_status_category_idx" ON "IdeaDetails"("status", "category");

-- CreateIndex
CREATE INDEX "IdeaDetails_mergedIntoId_idx" ON "IdeaDetails"("mergedIntoId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCategory_slug_key" ON "CourseCategory"("slug");

-- CreateIndex
CREATE INDEX "CourseCategory_sortOrder_idx" ON "CourseCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "CourseCategoryLink_categoryId_sortOrder_idx" ON "CourseCategoryLink"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "ZoomSyncRun_startedAt_idx" ON "ZoomSyncRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Crew_slug_key" ON "Crew"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Crew_ruleKey_key" ON "Crew"("ruleKey");

-- CreateIndex
CREATE UNIQUE INDEX "Crew_conversationId_key" ON "Crew"("conversationId");

-- CreateIndex
CREATE INDEX "Crew_kind_sortOrder_idx" ON "Crew"("kind", "sortOrder");

-- CreateIndex
CREATE INDEX "CrewMember_userId_idx" ON "CrewMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_crewId_userId_key" ON "CrewMember"("crewId", "userId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_createdAt_idx" ON "Bookmark"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_zoomKey_key" ON "Event"("zoomKey");

-- CreateIndex
CREATE INDEX "Event_source_startsAt_idx" ON "Event"("source", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Happening_postId_key" ON "Happening"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCard_postId_key" ON "MemberCard"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Place_postId_key" ON "Place"("postId");

-- CreateIndex
CREATE INDEX "Post_spaceId_status_score_idx" ON "Post"("spaceId", "status", "score");

-- AddForeignKey
ALTER TABLE "IdeaDetails" ADD CONSTRAINT "IdeaDetails_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCategoryLink" ADD CONSTRAINT "CourseCategoryLink_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCategoryLink" ADD CONSTRAINT "CourseCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CourseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCard" ADD CONSTRAINT "MemberCard_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Happening" ADD CONSTRAINT "Happening_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

