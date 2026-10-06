import "server-only";
import * as Sentry from "@sentry/nextjs";
import { afterResponse } from "@/lib/after-response";
import { awardBadges } from "@/lib/social/badges";

/**
 * Badges, checked at the moment they can be earned.
 *
 * Posting and replying already re-check a member's badges after the response
 * (`app/(member)/community-actions.ts`). These are the other moments a ladder
 * in `badge-rules.ts` can move, each wired where the thing happens:
 *
 * - `lesson-complete`: a lesson completed for the first time. A class is
 *   finished on its last lesson, so this is also the class ladder's moment.
 * - `roadmap-topic`: a roadmap topic completed. A skip is never a completion
 *   and never triggers one.
 * - `idea-planned`: an idea moved to Planned or Done, checked for its author.
 * - `live-class-rsvp`: an RSVP that became "going". The live-class ladder
 *   counts classes that have taken place, so this RSVP cannot earn anything
 *   by itself; it is when the classes a member already went to are caught up.
 * - `conversation-two-way`: the message that makes a one-to-one thread
 *   two-way, checked for both people in it.
 *
 * `awardBadges` is idempotent and notifies once per award, so a check that
 * runs twice costs a few counts and changes nothing. It runs after the
 * response: the member's action never waits for it, and nothing it does can
 * fail that action. A failure is logged and reported to Sentry; the next
 * check, or the next visit to the member's profile, catches up.
 */

export type BadgeTrigger =
  | "lesson-complete"
  | "roadmap-topic"
  | "idea-planned"
  | "live-class-rsvp"
  | "conversation-two-way";

/**
 * Who to check: one member, several, or a question answered after the
 * response (when working out who is itself a query the action should not
 * wait for).
 */
export type BadgeCheckMembers =
  | string
  | readonly string[]
  | (() => Promise<readonly string[]>);

function report(error: unknown, trigger: BadgeTrigger) {
  console.error(`[badges] ${trigger} check failed`, error);
  Sentry.captureException(error, { tags: { area: "badges", trigger } });
}

async function resolveMembers(members: BadgeCheckMembers): Promise<string[]> {
  const ids =
    typeof members === "string" ? [members] : typeof members === "function" ? await members() : members;
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

/**
 * Re-checks badges for these members once the response has gone.
 *
 * Never throws and never rejects. Inside a request the check is handed to
 * `after()`, so awaiting this costs nothing; outside one (a script, a job, a
 * test) it runs in place.
 */
export async function awardBadgesAfterResponse(
  members: BadgeCheckMembers,
  trigger: BadgeTrigger,
): Promise<void> {
  if (Array.isArray(members) && members.length === 0) return;
  try {
    await afterResponse(async () => {
      let ids: string[];
      try {
        ids = await resolveMembers(members);
      } catch (error) {
        report(error, trigger);
        return;
      }
      // One at a time: each check is a handful of counts, and a failure for
      // one member must not stop the other's.
      for (const userId of ids) {
        try {
          await awardBadges(userId);
        } catch (error) {
          report(error, trigger);
        }
      }
    });
  } catch (error) {
    report(error, trigger);
  }
}
