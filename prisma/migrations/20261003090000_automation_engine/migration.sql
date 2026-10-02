-- AlterTable
ALTER TABLE "AutomationRule" ADD COLUMN     "slug" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Existing rows (there are none in any environment, but be safe) get a slug
-- and a timestamp before the columns become required.
UPDATE "AutomationRule" SET "slug" = "id" WHERE "slug" IS NULL;
UPDATE "AutomationRule" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "AutomationRule" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "AutomationRule" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "RuleExecution" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "AutomationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "pausedAt" TIMESTAMP(3),
    "pausedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "userId" TEXT,
    "ruleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "AdminTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRule_slug_key" ON "AutomationRule"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RuleExecution_ruleId_dedupeKey_key" ON "RuleExecution"("ruleId", "dedupeKey");

-- CreateIndex
CREATE INDEX "RuleExecution_ruleId_createdAt_idx" ON "RuleExecution"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "RuleExecution_userId_createdAt_idx" ON "RuleExecution"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminTask_status_createdAt_idx" ON "AdminTask"("status", "createdAt");
