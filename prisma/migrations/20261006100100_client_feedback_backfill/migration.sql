-- Client feedback, 2026-10-06: backfills for the structure added in the
-- previous migration (DEC-078).
--
-- Every statement is idempotent (deterministic ids, ON CONFLICT DO NOTHING),
-- so running it twice, or against a database where an admin already created
-- one of these rows by hand, changes nothing. No existing row is updated or
-- deleted.

-- 1. Course categories: each class's old single `category` becomes a shelf in
--    the library, and the class is placed on it. `Course.category` is kept as
--    it was, unread, so this can be undone.
INSERT INTO "CourseCategory" ("id", "slug", "name", "sortOrder", "createdAt", "updatedAt")
SELECT
  'cat_' || substr(md5('course-category:' || x.slug), 1, 21),
  x.slug,
  x.name,
  x.sort,
  now(),
  now()
FROM (
  SELECT
    trim(both '-' from regexp_replace(lower(trim(c."category")), '[^a-z0-9]+', '-', 'g')) AS slug,
    min(trim(c."category")) AS name,
    min(c."categoryOrder") AS sort
  FROM "Course" c
  WHERE c."category" IS NOT NULL AND trim(c."category") <> ''
  GROUP BY 1
) x
WHERE x.slug <> ''
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "CourseCategoryLink" ("courseId", "categoryId", "sortOrder", "createdAt")
SELECT c."id", cc."id", c."catalogOrder", now()
FROM "Course" c
JOIN "CourseCategory" cc
  ON cc."slug" = trim(both '-' from regexp_replace(lower(trim(c."category")), '[^a-z0-9]+', '-', 'g'))
WHERE c."category" IS NOT NULL AND trim(c."category") <> ''
ON CONFLICT DO NOTHING;

-- 2. The Ideas & Requests board. A space only as a container, so ideas get
--    comments, reactions, reports and moderation for free; it is not shown as
--    a "space" anywhere.
INSERT INTO "Space" (
  "id", "slug", "name", "description", "kind", "visibility",
  "postingPermission", "approvalRequired", "notificationDefault",
  "sortOrder", "createdAt", "updatedAt"
)
VALUES (
  'space_ideas',
  'ideas',
  'Ideas & Requests',
  'Ask for the classes, recipes and features you want next, and upvote the ones you want most.',
  'FEED',
  'MEMBERS',
  'ALL_MEMBERS',
  false,
  'HIGHLIGHTS',
  900,
  now(),
  now()
)
ON CONFLICT ("slug") DO NOTHING;

-- 3. Crews that exist from day one. Cohort and roadmap crews are created by
--    the recompute job as members need them; these six are fixed.
--    TRAIT crews are filled automatically from the RightMessage answers Kit
--    holds. OPTIONAL crews are only ever joined by the member.
INSERT INTO "Crew" ("id", "slug", "name", "description", "kind", "ruleKey", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('crew_gluten_free_gang', 'gluten-free-gang', 'Gluten-Free Gang',
   'Cooking gluten-free, and comparing notes on what actually works.',
   'TRAIT', 'trait:gf', 10, now(), now()),
  ('crew_advanced_cooking_crew', 'advanced-cooking-crew', 'Advanced Cooking Crew',
   'For cooks on the more advanced side who want the harder projects.',
   'TRAIT', 'trait:advanced', 11, now(), now()),
  ('crew_nooch_newbies', 'nooch-newbies', 'Nooch Newbies',
   'New to vegan cooking. Every question is a good one here.',
   'TRAIT', 'trait:new', 12, now(), now()),
  ('crew_wfpb_posse', 'wfpb-posse', 'WFPB Posse',
   'Whole-food, plant-based cooking: no oil, lots of flavour.',
   'OPTIONAL', NULL, 20, now(), now()),
  ('crew_animal_rights_activists', 'animal-rights-activists', 'Animal Rights Activists',
   'For members who want to talk about advocacy as well as dinner.',
   'OPTIONAL', NULL, 21, now(), now()),
  ('crew_on_the_road_to_vegan', 'on-the-road-to-vegan', 'On The Road to Vegan',
   'Still on the way, and glad of the company.',
   'OPTIONAL', NULL, 22, now(), now())
ON CONFLICT ("slug") DO NOTHING;
