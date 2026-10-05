-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "description" TEXT,
ADD COLUMN     "targetCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "spaceId" TEXT,
ADD COLUMN     "cohortId" TEXT,
ADD COLUMN     "badgeSlug" TEXT,
ADD COLUMN     "kitTag" TEXT,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "Challenge" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "Challenge" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "ChallengeParticipant" ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "leftAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChallengePrompt" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "ChallengePrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeEntry" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "postId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Challenge_published_startsAt_idx" ON "Challenge"("published", "startsAt");

-- CreateIndex
CREATE INDEX "ChallengePrompt_challengeId_day_idx" ON "ChallengePrompt"("challengeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengePrompt_challengeId_day_key" ON "ChallengePrompt"("challengeId", "day");

-- CreateIndex
CREATE INDEX "ChallengeEntry_participantId_idx" ON "ChallengeEntry"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeEntry_participantId_promptId_key" ON "ChallengeEntry"("participantId", "promptId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_userId_completedAt_idx" ON "ChallengeParticipant"("userId", "completedAt");

-- AddForeignKey
ALTER TABLE "ChallengePrompt" ADD CONSTRAINT "ChallengePrompt_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ChallengeParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeEntry" ADD CONSTRAINT "ChallengeEntry_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "ChallengePrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
