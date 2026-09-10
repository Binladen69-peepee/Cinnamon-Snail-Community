-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "catalogOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "categoryOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "liveAt" TIMESTAMP(3),
ADD COLUMN     "teaserVideoUrl" TEXT;

-- CreateTable
CREATE TABLE "MemberGeoPoint" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mighty',
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberGeoPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberGeoPoint_source_idx" ON "MemberGeoPoint"("source");

-- CreateIndex
CREATE UNIQUE INDEX "MemberGeoPoint_source_country_region_city_key" ON "MemberGeoPoint"("source", "country", "region", "city");

-- CreateIndex
CREATE INDEX "Course_published_category_catalogOrder_idx" ON "Course"("published", "category", "catalogOrder");

