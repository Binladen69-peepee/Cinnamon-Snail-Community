import "server-only";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { RESYNC_AFTER_MS, syncKitSurveyTraits } from "@/lib/crews/kit-survey";
import { recomputeCrews } from "@/lib/crews/recompute";
import { readStoredSurveyTraits, surveyMappingFromEnv } from "@/lib/crews/survey-traits";
import { kitConfigured } from "@/lib/roadmap/kit-client";

/**
 * A member's own crews, brought up to date when they arrive (DEC-078).
 *
 * The daily crews job reads Kit for about 45 members a run, because Kit allows
 * 120 requests a minute and the job has sixty seconds. On a large membership
 * the first full pass would take days, and in the meantime a gluten-free
 * member would open Crews and not find the Gluten-Free Gang. So a member whose
 * survey answers were never read (or are a week old, or were read under an
 * older mapping) gets theirs read when they open the app, and their crews
 * recomputed, after the response. The next page they load shows the result.
 *
 * - **One Kit read per member per hour at most**, so a member Kit does not
 *   know is not looked up on every load.
 * - **At most 30 such reads a minute across the app**, so a busy morning
 *   leaves most of Kit's allowance to the daily job.
 * - **The member's crews only.** The recompute is scoped to them; nobody
 *   else's membership changes.
 */

const VISIT_READS_PER_MINUTE = 30;
const MEMBER_RETRY_MS = 60 * 60_000;

export async function refreshViewerCrews(
  userId: string,
  options: { now?: Date } = {},
): Promise<boolean> {
  if (!kitConfigured()) return false;
  const now = options.now ?? new Date();

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { surveySyncedAt: true, surveyTraits: true },
  });
  if (!profile) return false;

  const mapping = surveyMappingFromEnv();
  const due =
    !profile.surveySyncedAt ||
    now.getTime() - profile.surveySyncedAt.getTime() >= RESYNC_AFTER_MS ||
    readStoredSurveyTraits(profile.surveyTraits)?.mapping !== mapping.key;
  if (!due) return false;

  const mine = await consumeRateLimit(`crews-visit:${userId}`, 1, MEMBER_RETRY_MS);
  if (!mine.ok) return false;
  const everyone = await consumeRateLimit("crews-visit", VISIT_READS_PER_MINUTE, 60_000);
  if (!everyone.ok) return false;

  const survey = await syncKitSurveyTraits({
    now,
    userIds: [userId],
    limit: 1,
    budgetMs: 10_000,
    spacingMs: 0,
    mapping,
    record: false,
    trigger: "visit",
  });
  if (survey.synced === 0) return false;

  await recomputeCrews({ now, onlyUserIds: [userId], record: false, trigger: "visit" });
  return true;
}
