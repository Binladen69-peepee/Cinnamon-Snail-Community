import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { KitApiError, kitConfigured } from "@/lib/roadmap/kit-client";
import { crewEligibleWhere } from "@/lib/crews/eligibility";
import {
  readStoredSurveyTraits,
  storedSurveyTraits,
  surveyMappingFromEnv,
  traitsFromFields,
  type SurveyMapping,
  type SurveyTrait,
} from "@/lib/crews/survey-traits";

/**
 * Kit → `Profile.surveyTraits`: the RightMessage survey answers that place a
 * member in Gluten-Free Gang, Advanced Cooking Crew or Nooch Newbies.
 *
 * Read-only towards Kit: one `GET /v3/subscribers?email_address=` per member,
 * which returns the subscriber with their custom fields. Only the fields that
 * produced a trait are kept, never the rest of the subscriber record.
 *
 * Bounded, because Kit allows 120 requests a minute per account and this runs
 * inside a sixty-second job: requests are spaced, the batch is capped and
 * time-boxed, members never synced go first and a member is not re-read for a
 * week unless the mapping changed. A rate limit or an outage stops the batch
 * rather than burning through it.
 *
 * Idempotent: syncing a member twice writes the same answer twice. Without Kit
 * credentials it records that Kit is not configured and changes nothing.
 */

const KIT_SPACING_MS = 550;
/** A member's answers are read again after a week, or when the mapping changes. */
export const RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export const KIT_SURVEY_ACTION = "crews.kit_survey_sync";

export type KitSubscriberFields =
  | { found: false }
  | { found: true; fields: Record<string, unknown> };

/** The one Kit call the sync makes. Injectable so tests never reach Kit. */
export type SurveyFieldReader = (email: string) => Promise<KitSubscriberFields>;

export function httpSurveyFieldReader(): SurveyFieldReader {
  const base = (process.env.KIT_API_BASE ?? "https://api.convertkit.com/v3").replace(/\/$/, "");
  const apiSecret = process.env.KIT_API_SECRET ?? "";
  return async (email) => {
    const url = new URL(`${base}/subscribers`);
    url.searchParams.set("api_secret", apiSecret);
    url.searchParams.set("email_address", email);
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new KitApiError(
        `Kit GET /subscribers failed: ${error instanceof Error ? error.message : "network error"}`,
        null,
      );
    }
    if (!response.ok) {
      // The body can echo the request; only the status is kept.
      throw new KitApiError(`Kit GET /subscribers HTTP ${response.status}`, response.status);
    }
    const data = (await response.json().catch(() => ({}))) as {
      subscribers?: { email_address?: string; fields?: Record<string, unknown> | null }[];
    };
    const match = data.subscribers?.find(
      (row) => row.email_address?.toLowerCase() === email.toLowerCase(),
    );
    return match ? { found: true, fields: match.fields ?? {} } : { found: false };
  };
}

export type KitSurveySyncResult = {
  configured: boolean;
  mapping: { configured: boolean; key: string; problems: string[] };
  /** Members whose answers were read this run. */
  synced: number;
  /** Of those, how many Kit had no subscriber for. */
  notFound: number;
  failed: number;
  /** Members still waiting for a first read or a refresh after this run. */
  remaining: number;
  traits: Record<SurveyTrait, number>;
  /** Custom-field keys seen on the subscribers read (names only, no values). */
  fieldKeys: string[];
  /** Why the batch ended before its cap, when it did. */
  stoppedEarly: string | null;
};

function emptyTraitCounts(): Record<SurveyTrait, number> {
  return { gf: 0, advanced: 0, new: 0 };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function syncKitSurveyTraits(
  options: {
    now?: Date;
    limit?: number;
    budgetMs?: number;
    /** Restrict to these members (tests, or one member on demand). */
    userIds?: string[];
    /** Overrides Kit, for tests. */
    reader?: SurveyFieldReader;
    mapping?: SurveyMapping;
    /** Spacing between Kit requests; tests pass 0. */
    spacingMs?: number;
    record?: boolean;
    actorId?: string | null;
    trigger?: string;
  } = {},
): Promise<KitSurveySyncResult> {
  const now = options.now ?? new Date();
  const mapping = options.mapping ?? surveyMappingFromEnv();
  const configured = Boolean(options.reader) || kitConfigured();
  const result: KitSurveySyncResult = {
    configured,
    mapping: { configured: mapping.configured, key: mapping.key, problems: mapping.problems },
    synced: 0,
    notFound: 0,
    failed: 0,
    remaining: 0,
    traits: emptyTraitCounts(),
    fieldKeys: [],
    stoppedEarly: null,
  };

  if (!configured) {
    result.stoppedEarly = "Kit is not configured";
    if (options.record !== false) await record(result, options);
    return result;
  }

  const reader = options.reader ?? httpSurveyFieldReader();
  const limit = Math.max(1, options.limit ?? 60);
  const deadline = Date.now() + (options.budgetMs ?? 25_000);
  const spacing = options.spacingMs ?? KIT_SPACING_MS;

  // Everyone the crews consider, oldest answer first. Filtered in memory for
  // staleness because "the mapping changed" lives inside the JSON.
  const profiles = await prisma.profile.findMany({
    where: {
      user: crewEligibleWhere(now),
      ...(options.userIds ? { userId: { in: options.userIds } } : {}),
    },
    orderBy: [{ surveySyncedAt: { sort: "asc", nulls: "first" } }, { userId: "asc" }],
    select: {
      userId: true,
      surveySyncedAt: true,
      surveyTraits: true,
      user: { select: { email: true } },
    },
  });
  const due = profiles.filter((profile) => {
    if (!profile.surveySyncedAt) return true;
    if (now.getTime() - profile.surveySyncedAt.getTime() >= RESYNC_AFTER_MS) return true;
    return readStoredSurveyTraits(profile.surveyTraits)?.mapping !== mapping.key;
  });

  const keys = new Set<string>();
  for (let index = 0; index < due.length && result.synced < limit; index += 1) {
    if (Date.now() >= deadline) {
      result.stoppedEarly = "time budget used";
      break;
    }
    const profile = due[index]!;
    if (index > 0 && spacing > 0) await sleep(spacing);

    let answer: KitSubscriberFields;
    try {
      answer = await reader(profile.user.email);
    } catch (error) {
      result.failed += 1;
      const kitError = error instanceof KitApiError ? error : null;
      if (!kitError || kitError.transient) {
        result.stoppedEarly = kitError?.status === 429 ? "Kit rate limit" : "Kit unavailable";
      } else {
        result.stoppedEarly =
          kitError.status === 401 || kitError.status === 403
            ? "Kit refused the API secret"
            : `Kit error ${kitError.status}`;
      }
      // Whatever went wrong will go wrong for the next member too.
      break;
    }

    const match = answer.found
      ? traitsFromFields(answer.fields, mapping)
      : { traits: [], fields: {} };
    if (answer.found) for (const key of Object.keys(answer.fields)) keys.add(key);
    else result.notFound += 1;
    for (const trait of match.traits) result.traits[trait] += 1;

    await prisma.profile.update({
      where: { userId: profile.userId },
      data: {
        surveyTraits: storedSurveyTraits({
          found: answer.found,
          match,
          mapping,
        }) as unknown as Prisma.InputJsonValue,
        surveySyncedAt: now,
      },
    });
    result.synced += 1;
  }

  result.remaining = Math.max(0, due.length - result.synced);
  result.fieldKeys = [...keys].sort().slice(0, 60);
  if (options.record !== false) await record(result, options);
  return result;
}

async function record(
  result: KitSurveySyncResult,
  options: { actorId?: string | null; trigger?: string },
) {
  await writeAuditLog({
    actorId: options.actorId ?? null,
    action: KIT_SURVEY_ACTION,
    targetType: "crews",
    metadata: { ...result, trigger: options.trigger ?? "job" } as unknown as Prisma.InputJsonValue,
  }).catch(() => undefined);
}
