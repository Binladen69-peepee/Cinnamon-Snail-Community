-- Welcome DM: first-login stamp, admin-editable settings, and the send queue.
--
-- Purely additive: one nullable column and two new tables.
--
-- NOTE: `prisma migrate diff` also emitted drops for SearchIndex.search_tsv
-- and its three FTS/trigram indexes. Those were created by raw SQL in an
-- earlier migration and are absent from schema.prisma, so Prisma believes
-- they are drift and tries to remove them on every diff. They have been
-- stripped here; removing them would destroy full-text search. This is the
-- same edit made in 20260911160000_space_groups_favorites_resources.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WelcomeMessageSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 10,
    "senderId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "WelcomeMessageSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeMessageJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeMessageJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per member. This constraint, not application logic, is what makes a
-- double-send impossible when two first sign-ins race.
CREATE UNIQUE INDEX "WelcomeMessageJob_userId_key" ON "WelcomeMessageJob"("userId");

-- CreateIndex
CREATE INDEX "WelcomeMessageJob_sentAt_canceledAt_dueAt_idx" ON "WelcomeMessageJob"("sentAt", "canceledAt", "dueAt");

-- AddForeignKey
ALTER TABLE "WelcomeMessageSetting" ADD CONSTRAINT "WelcomeMessageSetting_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelcomeMessageJob" ADD CONSTRAINT "WelcomeMessageJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
