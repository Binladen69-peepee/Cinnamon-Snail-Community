-- `Event.slug` shipped NOT NULL with no default, which breaks every insert
-- that does not name it — including the feed composer's EVENT post path,
-- which creates an event and has no reason to know about slugs.
--
-- A default makes the column safe for callers that predate it. It is a
-- fallback and not the intended value: the calendar's own authoring paths
-- build a readable slug from the title.
ALTER TABLE "Event" ALTER COLUMN "slug" SET DEFAULT concat('e', replace(gen_random_uuid()::text, '-', ''));
