import "server-only";
import { prisma } from "@/lib/db";
import { kitConfigured } from "@/lib/roadmap/kit-client";
import { MEMBERSHIP_PRODUCT_KINDS } from "@/lib/crews/eligibility";
import { RECOMPUTE_ACTION, type RecomputeResult } from "@/lib/crews/recompute";
import { KIT_SURVEY_ACTION, type KitSurveySyncResult } from "@/lib/crews/kit-survey";
import { SAMCART_NO_DATE, SAMCART_START_ACTION, type SamcartStartResult } from "@/lib/crews/samcart-start";
import { describeRule, surveyMappingFromEnv, type SurveyMapping } from "@/lib/crews/survey-traits";
import type { CrewKindName } from "@/lib/crews/labels";

/**
 * Everything `/admin/crews` shows. Read-only: the numbers come from the rows
 * and from the last run of each step, never from re-running anything on a
 * page view.
 */

export type AdminCrewRow = {
  id: string;
  slug: string;
  name: string;
  kind: CrewKindName;
  ruleKey: string | null;
  archived: boolean;
  auto: number;
  optIn: number;
  hasChat: boolean;
};

export type LastRun<T> = { at: Date; trigger: string | null; result: T } | null;

export type CrewsConsole = {
  crews: AdminCrewRow[];
  recompute: LastRun<RecomputeResult>;
  survey: LastRun<KitSurveySyncResult>;
  samcart: LastRun<SamcartStartResult>;
  kit: {
    configured: boolean;
    mapping: SurveyMapping;
    rules: { trait: string; text: string }[];
    synced: number;
    neverSynced: number;
  };
  starts: {
    configured: boolean;
    /** Membership subscriptions by where their start date came from. */
    fromApi: number;
    fromWebhook: number;
    /** SamCart was asked and gave no date. */
    undated: number;
    /** Not yet known. */
    unknown: number;
  };
};

async function lastRun<T>(action: string): Promise<LastRun<T>> {
  const row = await prisma.auditLog.findFirst({
    where: { action },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, metadata: true },
  });
  if (!row || !row.metadata || typeof row.metadata !== "object") return null;
  const metadata = row.metadata as Record<string, unknown>;
  return {
    at: row.createdAt,
    trigger: typeof metadata.trigger === "string" ? metadata.trigger : null,
    result: metadata as unknown as T,
  };
}

const TRAIT_NAMES: Record<string, string> = {
  gf: "Gluten-Free Gang",
  advanced: "Advanced Cooking Crew",
  new: "Nooch Newbies",
};

export async function loadCrewsConsole(): Promise<CrewsConsole> {
  const membershipSubs = {
    samcartSubscriptionId: { not: null },
    product: { kind: { in: [...MEMBERSHIP_PRODUCT_KINDS] } },
  };
  const [crews, counts, recompute, survey, samcart, synced, neverSynced, starts] =
    await Promise.all([
      prisma.crew.findMany({
        orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          kind: true,
          ruleKey: true,
          archivedAt: true,
          conversationId: true,
        },
      }),
      prisma.crewMember.groupBy({ by: ["crewId", "source"], _count: { _all: true } }),
      lastRun<RecomputeResult>(RECOMPUTE_ACTION),
      lastRun<KitSurveySyncResult>(KIT_SURVEY_ACTION),
      lastRun<SamcartStartResult>(SAMCART_START_ACTION),
      prisma.profile.count({ where: { surveySyncedAt: { not: null } } }),
      prisma.profile.count({ where: { surveySyncedAt: null, user: { status: "ACTIVE" } } }),
      prisma.subscription.groupBy({
        by: ["startedAtSource"],
        where: membershipSubs,
        _count: { _all: true },
      }),
    ]);

  const countFor = (crewId: string, source: "AUTO" | "OPT_IN") =>
    counts.find((row) => row.crewId === crewId && row.source === source)?._count._all ?? 0;
  const startsFrom = (source: string | null) =>
    starts.find((row) => row.startedAtSource === source)?._count._all ?? 0;

  const mapping = surveyMappingFromEnv();
  return {
    crews: crews.map((crew) => ({
      id: crew.id,
      slug: crew.slug,
      name: crew.name,
      kind: crew.kind,
      ruleKey: crew.ruleKey,
      archived: Boolean(crew.archivedAt),
      auto: countFor(crew.id, "AUTO"),
      optIn: countFor(crew.id, "OPT_IN"),
      hasChat: Boolean(crew.conversationId),
    })),
    recompute,
    survey,
    samcart,
    kit: {
      configured: kitConfigured(),
      mapping,
      rules: mapping.rules.map((rule) => ({
        trait: TRAIT_NAMES[rule.trait] ?? rule.trait,
        text: describeRule(rule),
      })),
      synced,
      neverSynced,
    },
    starts: {
      configured: Boolean(process.env.SAMCART_API_KEY),
      fromApi: startsFrom("samcart_api"),
      fromWebhook: startsFrom("webhook"),
      undated: startsFrom(SAMCART_NO_DATE),
      unknown: startsFrom(null),
    },
  };
}
