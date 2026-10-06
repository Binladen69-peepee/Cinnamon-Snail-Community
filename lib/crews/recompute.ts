import "server-only";
import { Prisma, type CrewKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { cohortSeasonFor, type CohortSeason } from "@/lib/crews/seasons";
import { planChatMembership, planCrewMembership } from "@/lib/crews/plan";
import { MEMBERSHIP_PRODUCT_KINDS, crewEligibleWhere } from "@/lib/crews/eligibility";
import {
  SURVEY_TRAITS,
  TRAIT_CREWS,
  TRAIT_RULE_KEYS,
  readStoredSurveyTraits,
  type SurveyTrait,
} from "@/lib/crews/survey-traits";

/**
 * The automatic crews, rebuilt from their rules (DEC-078).
 *
 * Only three rules put anybody in a crew automatically:
 *
 * 1. **Cohort** — the season of the member's original SamCart subscription
 *    start (`Subscription.startedAt`, earliest of their membership
 *    subscriptions). Nothing else is used for it: not when the row was
 *    written, not an entitlement's start, both of which are the migration
 *    date for an imported member. No known start, no cohort crew.
 * 2. **Roadmap** — one crew per published roadmap track, for the members on
 *    it who have not paused. A track that is unpublished or deleted has its
 *    crew archived, never deleted, so the chat history survives; it comes
 *    back if the track is published again.
 * 3. **Traits** — Gluten-Free Gang, Advanced Cooking Crew and Nooch Newbies,
 *    from the RightMessage answers the Kit sync stored on the profile.
 *
 * The job adds and removes AUTO rows on those crews and nothing else: OPT_IN
 * rows are the member's own, and OPTIONAL crews are never passed to the
 * planner, so nobody is ever put in one. Running it twice in a row changes
 * nothing the second time. Each crew's group chat is kept in step with the
 * crew in the same pass.
 */

export const RECOMPUTE_ACTION = "crews.recompute";

export type RuleCrewSpec = {
  ruleKey: string;
  kind: CrewKind;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
};

/** A member's crews read cohort, roadmap, traits, then the ones they joined. */
const COHORT_SORT = 1;
const ROADMAP_SORT = 5;

export function cohortCrewSpec(cohort: CohortSeason): RuleCrewSpec {
  return {
    ruleKey: cohort.ruleKey,
    kind: "COHORT",
    slug: cohort.slug,
    name: cohort.name,
    description: `Everyone who started Vegan University from ${cohort.span}.`,
    sortOrder: COHORT_SORT,
  };
}

export function roadmapRuleKey(trackSlug: string): string {
  return `roadmap:${trackSlug}`;
}

export function roadmapCrewSpec(track: { slug: string; name: string }): RuleCrewSpec {
  const name = track.name.trim();
  return {
    ruleKey: roadmapRuleKey(track.slug),
    kind: "ROADMAP",
    slug: `roadmap-${track.slug}`.slice(0, 80),
    name: `${name} crew`,
    description: `Everyone working through the ${name} roadmap.`,
    sortOrder: ROADMAP_SORT,
  };
}

export function traitCrewSpec(trait: SurveyTrait): RuleCrewSpec {
  const crew = TRAIT_CREWS[trait];
  return {
    ruleKey: TRAIT_RULE_KEYS[trait],
    kind: "TRAIT",
    slug: crew.slug,
    name: crew.name,
    description: crew.description,
    sortOrder: crew.sortOrder,
  };
}

/**
 * The crew for a rule, creating it the first time a member needs it. Safe
 * against two runs at once (the rule key is unique) and against a crew
 * someone already made under the same slug (the new one takes a suffix).
 */
async function ensureRuleCrew(spec: RuleCrewSpec): Promise<{ id: string; created: boolean }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.crew.findUnique({
      where: { ruleKey: spec.ruleKey },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const slug = attempt === 0 ? spec.slug : `${spec.slug}-${attempt + 1}`;
    try {
      const created = await prisma.crew.create({
        data: { ...spec, slug },
        select: { id: true },
      });
      return { id: created.id, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      // Lost a race on the rule key (the next loop finds the winner), or the
      // slug belongs to another crew (the next loop tries a suffix).
    }
  }
  throw new Error(`Could not create the crew for ${spec.ruleKey}`);
}

export type RecomputeResult = {
  /** Members the rules were applied to. */
  members: number;
  /** Of those, how many have no known original SamCart start (no cohort crew). */
  withoutStart: number;
  crewsCreated: number;
  crewsArchived: number;
  crewsRestored: number;
  managedCrews: number;
  added: number;
  removed: number;
  chats: { added: number; left: number; rejoined: number };
};

const CHUNK = 500;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export async function recomputeCrews(
  options: {
    now?: Date;
    /** Apply the rules to these members only (tests; one member on demand). */
    onlyUserIds?: string[];
    record?: boolean;
    actorId?: string | null;
    trigger?: string;
  } = {},
): Promise<RecomputeResult> {
  const now = options.now ?? new Date();
  const scoped = options.onlyUserIds ? { in: [...new Set(options.onlyUserIds)] } : null;

  // 1. Who the rules apply to, and what each rule says about them.
  const [members, starts, roadmaps, tracks] = await Promise.all([
    prisma.user.findMany({
      where: { ...crewEligibleWhere(now), ...(scoped ? { id: scoped } : {}) },
      select: { id: true, profile: { select: { surveyTraits: true } } },
    }),
    prisma.subscription.findMany({
      where: {
        startedAt: { not: null },
        product: { kind: { in: [...MEMBERSHIP_PRODUCT_KINDS] } },
        ...(scoped ? { userId: scoped } : {}),
      },
      select: { userId: true, startedAt: true },
    }),
    prisma.memberRoadmap.findMany({
      where: {
        pausedAt: null,
        track: { published: true },
        ...(scoped ? { userId: scoped } : {}),
      },
      select: { userId: true, track: { select: { slug: true, name: true } } },
    }),
    prisma.roadmapTrack.findMany({ select: { slug: true, name: true, published: true } }),
  ]);
  const eligible = new Set(members.map((member) => member.id));

  const startByUser = new Map<string, Date>();
  for (const row of starts) {
    if (!row.startedAt || !eligible.has(row.userId)) continue;
    const current = startByUser.get(row.userId);
    if (!current || row.startedAt < current) startByUser.set(row.userId, row.startedAt);
  }

  const wanted = new Map<string, Set<string>>();
  const want = (ruleKey: string, userId: string) => {
    const set = wanted.get(ruleKey) ?? new Set<string>();
    set.add(userId);
    wanted.set(ruleKey, set);
  };
  const specs = new Map<string, RuleCrewSpec>();

  for (const [userId, startedAt] of startByUser) {
    const spec = cohortCrewSpec(cohortSeasonFor(startedAt));
    specs.set(spec.ruleKey, spec);
    want(spec.ruleKey, userId);
  }
  for (const row of roadmaps) {
    if (!eligible.has(row.userId)) continue;
    const spec = roadmapCrewSpec(row.track);
    specs.set(spec.ruleKey, spec);
    want(spec.ruleKey, row.userId);
  }
  for (const member of members) {
    const stored = readStoredSurveyTraits(member.profile?.surveyTraits);
    for (const trait of stored?.traits ?? []) want(TRAIT_RULE_KEYS[trait], member.id);
  }
  // The trait crews are part of the rules whether or not anyone has the trait.
  for (const trait of SURVEY_TRAITS) {
    const spec = traitCrewSpec(trait);
    specs.set(spec.ruleKey, spec);
  }

  // 2. The crews themselves: create what is newly needed, and keep each
  //    roadmap crew in step with its track.
  let crewsCreated = 0;
  let crewsArchived = 0;
  let crewsRestored = 0;

  const known = new Set(
    (
      await prisma.crew.findMany({
        where: { ruleKey: { in: [...specs.keys()] } },
        select: { ruleKey: true },
      })
    ).map((row) => row.ruleKey),
  );
  for (const spec of specs.values()) {
    if (known.has(spec.ruleKey)) continue;
    const { created } = await ensureRuleCrew(spec);
    if (created) crewsCreated += 1;
  }

  const publishedTracks = new Map(
    tracks.filter((track) => track.published).map((track) => [roadmapRuleKey(track.slug), track]),
  );
  const roadmapCrews = await prisma.crew.findMany({
    where: { kind: "ROADMAP", ruleKey: { not: null } },
    select: { id: true, ruleKey: true, name: true, archivedAt: true, conversationId: true },
  });
  for (const crew of roadmapCrews) {
    const track = publishedTracks.get(crew.ruleKey!);
    if (!track) {
      if (!crew.archivedAt) {
        await prisma.crew.update({ where: { id: crew.id }, data: { archivedAt: now } });
        crewsArchived += 1;
      }
      continue;
    }
    const name = roadmapCrewSpec(track).name;
    if (crew.archivedAt || crew.name !== name) {
      await prisma.crew.update({
        where: { id: crew.id },
        data: { archivedAt: null, name },
      });
      if (crew.archivedAt) crewsRestored += 1;
    }
  }

  // 3. Memberships: AUTO rows on the rule crews that are not archived.
  const managed = await prisma.crew.findMany({
    where: {
      kind: { in: ["COHORT", "ROADMAP", "TRAIT"] },
      ruleKey: { not: null },
      archivedAt: null,
    },
    select: { id: true, ruleKey: true },
  });
  const desired = new Map<string, Set<string>>(
    managed.map((crew) => [crew.id, wanted.get(crew.ruleKey!) ?? new Set<string>()]),
  );
  const existing = await prisma.crewMember.findMany({
    where: {
      crewId: { in: managed.map((crew) => crew.id) },
      ...(scoped ? { userId: scoped } : {}),
    },
    select: { id: true, crewId: true, userId: true, source: true },
  });
  const plan = planCrewMembership(desired, existing);

  let added = 0;
  for (const batch of chunks(plan.add)) {
    const result = await prisma.crewMember.createMany({
      data: batch.map((row) => ({ ...row, source: "AUTO" as const, joinedAt: now })),
      skipDuplicates: true,
    });
    added += result.count;
  }
  let removed = 0;
  for (const batch of chunks(plan.remove)) {
    // `source` is repeated here as a guard: whatever the plan says, an
    // OPT_IN row cannot be deleted by this statement.
    const result = await prisma.crewMember.deleteMany({
      where: { id: { in: batch }, source: "AUTO" },
    });
    removed += result.count;
  }

  // 4. Every crew chat follows its crew, opt-in crews included.
  const chats = await syncCrewChats({ now, scoped: scoped?.in ?? null });

  const result: RecomputeResult = {
    members: members.length,
    withoutStart: members.filter((member) => !startByUser.has(member.id)).length,
    crewsCreated,
    crewsArchived,
    crewsRestored,
    managedCrews: managed.length,
    added,
    removed,
    chats,
  };

  if (options.record !== false) {
    await writeAuditLog({
      actorId: options.actorId ?? null,
      action: RECOMPUTE_ACTION,
      targetType: "crews",
      metadata: {
        ...result,
        trigger: options.trigger ?? "job",
        scoped: Boolean(scoped),
      } as unknown as Prisma.InputJsonValue,
    }).catch(() => undefined);
  }
  return result;
}

/**
 * Brings each crew's group chat in line with the crew: new crew members are
 * added, people who left the crew stop receiving it, and people who come back
 * to the crew come back to the chat. A member who left the chat on their own
 * stays out (see `planChatMembership`). The chat's title follows the crew's
 * name.
 */
export async function syncCrewChats(input: {
  now: Date;
  scoped?: string[] | null;
  crewIds?: string[];
}): Promise<RecomputeResult["chats"]> {
  const totals = { added: 0, left: 0, rejoined: 0 };
  const crews = await prisma.crew.findMany({
    where: {
      archivedAt: null,
      conversationId: { not: null },
      ...(input.crewIds ? { id: { in: input.crewIds } } : {}),
    },
    select: { id: true, name: true, conversationId: true, conversation: { select: { title: true } } },
  });
  const userFilter = input.scoped ? { userId: { in: input.scoped } } : {};

  for (const crew of crews) {
    const conversationId = crew.conversationId!;
    const [crewMembers, chatMembers] = await Promise.all([
      prisma.crewMember.findMany({
        where: { crewId: crew.id, ...userFilter },
        select: { userId: true, joinedAt: true },
      }),
      prisma.conversationMember.findMany({
        where: { conversationId, ...userFilter },
        select: { userId: true, leftAt: true },
      }),
    ]);
    const plan = planChatMembership(crewMembers, chatMembers);

    if (plan.add.length) {
      const result = await prisma.conversationMember.createMany({
        data: plan.add.map((userId) => ({ conversationId, userId })),
        skipDuplicates: true,
      });
      totals.added += result.count;
    }
    if (plan.leave.length) {
      const result = await prisma.conversationMember.updateMany({
        where: { conversationId, userId: { in: plan.leave }, leftAt: null },
        data: { leftAt: input.now, typingAt: null },
      });
      totals.left += result.count;
    }
    if (plan.rejoin.length) {
      const result = await prisma.conversationMember.updateMany({
        where: { conversationId, userId: { in: plan.rejoin } },
        data: { leftAt: null },
      });
      totals.rejoined += result.count;
    }
    if (crew.conversation && crew.conversation.title !== crew.name) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: crew.name },
      });
    }
  }
  return totals;
}
