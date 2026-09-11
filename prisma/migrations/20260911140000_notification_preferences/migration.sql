-- Which notification categories reach a member, per channel.
-- Nullable: null means "everything in-app", which is exactly how the
-- product behaved before this column existed, so no backfill is needed.
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
