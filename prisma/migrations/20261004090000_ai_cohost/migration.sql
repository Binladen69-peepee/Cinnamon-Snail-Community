-- AlterTable
ALTER TABLE "AiPromptSchedule" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Cohost',
ADD COLUMN     "autoPausedAt" TIMESTAMP(3),
ADD COLUMN     "autoPauseReason" TEXT,
ADD COLUMN     "authorUserId" TEXT,
ADD COLUMN     "lastGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "AiPromptSchedule" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "AiPromptSchedule" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "AiPromptDraft" ADD COLUMN     "editedBody" TEXT,
ADD COLUMN     "promptType" TEXT NOT NULL DEFAULT 'experience',
ADD COLUMN     "guardrail" JSONB,
ADD COLUMN     "generation" JSONB,
ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedPostId" TEXT,
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "AiPromptDraft" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "AiPromptDraft" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "AiVoiceProfile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "voice" TEXT NOT NULL,
    "bannedTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AiVoiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPromptSchedule_paused_idx" ON "AiPromptSchedule"("paused");

-- CreateIndex
CREATE INDEX "AiPromptDraft_status_createdAt_idx" ON "AiPromptDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiPromptDraft_scheduleId_status_idx" ON "AiPromptDraft"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "AiPromptDraft_status_publishAt_idx" ON "AiPromptDraft"("status", "publishAt");
