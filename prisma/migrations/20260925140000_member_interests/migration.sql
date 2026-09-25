-- CreateEnum
CREATE TYPE "InterestKind" AS ENUM ('CUISINE', 'TECHNIQUE', 'DIETARY', 'EQUIPMENT', 'GOAL');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'CONFIDENT', 'ADVANCED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "cookingLately" TEXT,
ADD COLUMN     "skill" "SkillLevel";

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "InterestKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileInterest" (
    "profileId" TEXT NOT NULL,
    "interestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileInterest_pkey" PRIMARY KEY ("profileId","interestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Interest_slug_key" ON "Interest"("slug");

-- CreateIndex
CREATE INDEX "Interest_kind_sortOrder_idx" ON "Interest"("kind", "sortOrder");

-- CreateIndex
CREATE INDEX "ProfileInterest_interestId_idx" ON "ProfileInterest"("interestId");

-- CreateIndex
CREATE INDEX "Profile_directoryVisible_skill_idx" ON "Profile"("directoryVisible", "skill");

-- CreateIndex
CREATE INDEX "Profile_directoryVisible_country_city_idx" ON "Profile"("directoryVisible", "country", "city");

-- CreateIndex
CREATE INDEX "Profile_directoryVisible_displayName_idx" ON "Profile"("directoryVisible", "displayName");

-- AddForeignKey
ALTER TABLE "ProfileInterest" ADD CONSTRAINT "ProfileInterest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileInterest" ADD CONSTRAINT "ProfileInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES "Interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill the skill enum from the free-text column members already filled in.
--
-- The three values below are the only three that occur; anything else is left
-- null rather than guessed at, so a member who wrote something unexpected is
-- simply unplaced rather than silently filed under "beginner".
UPDATE "Profile" SET "skill" = CASE lower(trim("skillLevel"))
  WHEN 'beginner' THEN 'BEGINNER'::"SkillLevel"
  WHEN 'new' THEN 'BEGINNER'::"SkillLevel"
  WHEN 'confident' THEN 'CONFIDENT'::"SkillLevel"
  WHEN 'intermediate' THEN 'CONFIDENT'::"SkillLevel"
  WHEN 'advanced' THEN 'ADVANCED'::"SkillLevel"
  WHEN 'experienced' THEN 'ADVANCED'::"SkillLevel"
  ELSE NULL
END
WHERE "skillLevel" IS NOT NULL AND "skill" IS NULL;
