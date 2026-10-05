-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kitTagMonthly" TEXT,
ADD COLUMN     "kitTagAnnual" TEXT;

-- AlterTable
ALTER TABLE "SamcartProductMap" ADD COLUMN     "interval" TEXT;

-- The client's confirmed mapping. Monthly and annual are separate things a
-- member buys, so the tag follows the billing interval rather than the
-- product.
UPDATE "Product"
   SET "kitTagMonthly" = 'Vegan University Monthly',
       "kitTagAnnual"  = 'Vegan University Annual'
 WHERE "slug" = 'membership';

-- Retire the old placeholder mapping. None of these tags exist in Kit, so
-- nothing is being removed from anybody — they had never been applied.
UPDATE "Product"
   SET "kitTag" = NULL
 WHERE "kitTag" IN ('vu-member', 'vu-course', 'vu-bundle');
