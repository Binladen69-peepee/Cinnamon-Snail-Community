-- The client's confirmed SamCart products. Monthly and annual are separate
-- products in SamCart, so the product id tells us the interval when a webhook
-- does not. Read only as a fallback — SamCart's own event stays the source of
-- truth (see lib/billing/apply.ts).
UPDATE "SamcartProductMap" SET "interval" = 'year'  WHERE "samcartProductId" = '1069358';
UPDATE "SamcartProductMap" SET "interval" = 'month' WHERE "samcartProductId" = '1069354';
