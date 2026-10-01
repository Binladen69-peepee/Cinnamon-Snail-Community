-- CreateEnum
CREATE TYPE "KitSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "RoadmapTrack" ADD COLUMN     "kitCompletedTag" TEXT,
ADD COLUMN     "kitTag" TEXT;

-- CreateTable
CREATE TABLE "KitRoadmapSync" (
    "userId" TEXT NOT NULL,
    "status" "KitSyncStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncedVersion" INTEGER NOT NULL DEFAULT 0,
    "applied" JSONB,
    "subscriberId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitRoadmapSync_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "KitRoadmapSync_status_nextAttemptAt_idx" ON "KitRoadmapSync"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "KitRoadmapSync" ADD CONSTRAINT "KitRoadmapSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
