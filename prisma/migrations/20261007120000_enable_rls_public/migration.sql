-- Row-level security on every table in the public schema (DEC-083).
--
-- Supabase serves the public schema through its Data API (REST and GraphQL)
-- to anyone holding the project's anon key, which is public by design, and
-- grants the anon and authenticated roles every privilege on each table a
-- migration creates. With RLS off, all 96 tables here were readable and
-- writable that way: members, sessions, OAuth accounts, messages, billing.
--
-- The app never uses the Data API for tables. It reads and writes through
-- Prisma as the table owner (postgres, which also has BYPASSRLS), so turning
-- RLS on with no policies changes nothing for the app and denies every row to
-- anon and authenticated. No table is meant to be public through the API:
-- public pages are rendered by the app itself. Storage (its own schema, and
-- the public video bucket) is untouched.
--
-- Least privilege on top of that: the two API roles lose their table and
-- sequence privileges here, and lose them by default for the tables future
-- migrations create, so a new table is not exposed even before its own RLS
-- line. service_role (a secret key, server-side only) is left as it is. The
-- role statements run only where the Supabase roles exist; a plain Postgres
-- (local development, CI) skips them.

ALTER TABLE "public"."Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AdminTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AiPromptDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AiPromptSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AiVoiceProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AutomationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Badge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."BillingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Bookmark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CancellationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Challenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChallengeEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChallengeParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ChallengePrompt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Cohort" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CohortMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CommentMention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConversationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseCategoryLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Crew" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CrewMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."EventReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."EventRsvp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Follow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Happening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."HappeningRsvp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."IdeaDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Interest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."KitRoadmapSync" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."KitSyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Lesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."LessonProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."LessonResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemberBadge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemberCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemberGeoPoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemberMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemberMilestoneProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MemberRoadmap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."NotificationDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PendingGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Place" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PlaceTestimonial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollVote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostMention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostReactionTally" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileInterest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Reaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Recipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RecipeVariation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RecipeVariationTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ReconciliationFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ReconciliationRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Resource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoadmapMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RoadmapTrack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RuleExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SamcartProductMap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SearchIndex" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SpaceGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SpaceMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SpaceResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Vote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WelcomeMessageJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WelcomeMessageSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ZoomSyncRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END
$rls$;
