-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'WAITLIST', 'NOT_GOING');

-- CreateEnum
CREATE TYPE "EventReminderKind" AS ENUM ('T24H', 'T1H');

-- CreateEnum
CREATE TYPE "EventRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hostId" TEXT,
ADD COLUMN     "recordingLessonId" TEXT,
ADD COLUMN     "recordingPostId" TEXT,
ADD COLUMN     "recordingUrl" TEXT,
ADD COLUMN     "recurrence" "EventRecurrence",
ADD COLUMN     "recurrenceEvery" INTEGER,
ADD COLUMN     "recurrenceUntil" TIMESTAMP(3),
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Every existing event needs an address before the column can be required.
-- The title is slugified where it yields something usable and the id is the
-- fallback, so the result is unique by construction: a title collision keeps
-- only the first and the rest fall through to their own id.
UPDATE "Event" SET "slug" = candidate.value
FROM (
  SELECT
    "id",
    CASE
      WHEN ranked.rank = 1 AND ranked.base <> '' THEN ranked.base
      ELSE ranked.base || '-' || substr("id", 1, 8)
    END AS value
  FROM (
    SELECT
      "id",
      trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g')) AS base,
      row_number() OVER (
        PARTITION BY trim(both '-' from regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'))
        ORDER BY "createdAt", "id"
      ) AS rank
    FROM "Event"
  ) AS ranked
) AS candidate
WHERE "Event"."id" = candidate."id" AND "Event"."slug" IS NULL;

-- Anything the slugifier could not make a word of falls back to its id.
UPDATE "Event" SET "slug" = "id" WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "Event" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "EventRsvp" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "waitlistPosition" INTEGER,
ALTER COLUMN "status" DROP DEFAULT;

-- The old column was free text written by one function, so the spellings are
-- known. Converted in place rather than dropped and re-added: dropping it
-- would silently reset every member's answer to "going", including the people
-- who said they were not coming.
UPDATE "EventRsvp" SET "status" = CASE lower("status")
  WHEN 'going' THEN 'GOING'
  WHEN 'waitlist' THEN 'WAITLIST'
  WHEN 'not_going' THEN 'NOT_GOING'
  WHEN 'notgoing' THEN 'NOT_GOING'
  ELSE 'GOING'
END;

ALTER TABLE "EventRsvp"
  ALTER COLUMN "status" TYPE "RsvpStatus" USING "status"::"RsvpStatus",
  ALTER COLUMN "status" SET DEFAULT 'GOING';

-- A waitlist that already had people on it keeps its order by arrival time.
UPDATE "EventRsvp" SET "waitlistPosition" = ordered.position
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "eventId" ORDER BY "createdAt", "id") AS position
  FROM "EventRsvp" WHERE "status" = 'WAITLIST'
) AS ordered
WHERE "EventRsvp"."id" = ordered."id";

-- CreateTable
CREATE TABLE "EventReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EventReminderKind" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventReminder_eventId_kind_idx" ON "EventReminder"("eventId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "EventReminder_eventId_userId_kind_key" ON "EventReminder"("eventId", "userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_recordingLessonId_key" ON "Event"("recordingLessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_recordingPostId_key" ON "Event"("recordingPostId");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_spaceId_startsAt_idx" ON "Event"("spaceId", "startsAt");

-- CreateIndex
CREATE INDEX "Event_seriesId_startsAt_idx" ON "Event"("seriesId", "startsAt");

-- CreateIndex
CREATE INDEX "Event_hostId_startsAt_idx" ON "Event"("hostId", "startsAt");

-- CreateIndex
CREATE INDEX "EventRsvp_eventId_status_waitlistPosition_idx" ON "EventRsvp"("eventId", "status", "waitlistPosition");

-- CreateIndex
CREATE INDEX "EventRsvp_userId_status_idx" ON "EventRsvp"("userId", "status");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_recordingLessonId_fkey" FOREIGN KEY ("recordingLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_recordingPostId_fkey" FOREIGN KEY ("recordingPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

