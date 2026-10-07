-- The live checkout (DEC-086). The site's button now sells SamCart product
-- 849150, the paid monthly membership, whose checkout also offers 849151, the
-- annual one. Both sell the same membership as the 1-month-free products
-- already mapped (1069354 monthly, 1069358 annual), so they map to the same
-- product with the same intervals. Without these rows a purchase through the
-- live checkout would grant no access and no Kit tag.
--
-- Written against the existing rows rather than a product id, so it does
-- nothing on a database where the free-month products were never mapped.
INSERT INTO "SamcartProductMap" ("id", "productId", "samcartProductId", "interval")
SELECT 'samcart-849150', m."productId", '849150', 'month'
FROM "SamcartProductMap" m
WHERE m."samcartProductId" = '1069354'
ON CONFLICT ("samcartProductId") DO UPDATE
  SET "productId" = EXCLUDED."productId", "interval" = EXCLUDED."interval";

INSERT INTO "SamcartProductMap" ("id", "productId", "samcartProductId", "interval")
SELECT 'samcart-849151', m."productId", '849151', 'year'
FROM "SamcartProductMap" m
WHERE m."samcartProductId" = '1069358'
ON CONFLICT ("samcartProductId") DO UPDATE
  SET "productId" = EXCLUDED."productId", "interval" = EXCLUDED."interval";
