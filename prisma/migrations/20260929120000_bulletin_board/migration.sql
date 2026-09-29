-- Bulletin board (BUILD.md §19). Additive only: every new column is nullable
-- or has a default, and the foreign keys go on tables nothing has written to.

-- AlterTable
ALTER TABLE "MemberCard" ADD COLUMN     "category" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Happening" ADD COLUMN     "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "HappeningRsvp" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "address" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "submittedById" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "PlaceTestimonial" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "MemberCard_status_updatedAt_idx" ON "MemberCard"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Happening_startsAt_idx" ON "Happening"("startsAt");

-- CreateIndex
CREATE INDEX "Happening_hostUserId_idx" ON "Happening"("hostUserId");

-- CreateIndex
CREATE INDEX "HappeningRsvp_userId_idx" ON "HappeningRsvp"("userId");

-- CreateIndex
CREATE INDEX "Place_status_city_idx" ON "Place"("status", "city");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceTestimonial_placeId_userId_key" ON "PlaceTestimonial"("placeId", "userId");

-- AddForeignKey
ALTER TABLE "MemberCard" ADD CONSTRAINT "MemberCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Happening" ADD CONSTRAINT "Happening_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HappeningRsvp" ADD CONSTRAINT "HappeningRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceTestimonial" ADD CONSTRAINT "PlaceTestimonial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

