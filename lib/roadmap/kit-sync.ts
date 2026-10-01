import { Prisma, type KitSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { afterResponse } from "@/lib/after-response";
import { milestoneStates } from "@/lib/roadmap";
import {
  httpKitClient,
  KitApiError,
  kitConfigured,
  type KitClient,
} from "@/lib/roadmap/kit-client";

/**
 * Roadmap → Kit (BUILD.md §14, Phase 4B "Kit roadmap sync").
 *
 * Kit learns where a member is on their roadmap — which track, whether they
 * are going, paused or finished, which step they are on — as custom fields,
 * plus a tag per track (while on it) and a tag per finished track (kept), so
 * Adam's sequences can speak to someone as a busy cook three steps in rather
 * than as an email address.
 *
 * What this deliberately does not do:
 *
 * - **Touch access.** SamCart remains the only authority on who may use the
 *   app (DEC-036); this writes marketing data about progress and reads nothing
 *   back.
 * - **Subscribe anyone.** Only a member who is already an *active* Kit
 *   subscriber is synced. Someone who never joined the list, or who
 *   unsubscribed, is left exactly as they are — adding a tag in Kit can
 *   subscribe an address, and that would override a commercial opt-out.
 * - **Block roadmap progress.** Syncing runs after the response, and every
 *   failure is caught, logged and retried by the sweep. A Kit outage is a
 *   delay in Kit, never an error on the roadmap page.
 *
 * Idempotency comes from syncing *state*, not events. Each member has one
 * `KitRoadmapSync` row holding what Kit last confirmed. A sync derives the
 * member's state from the database, sends only the difference, and records
 * each part as soon as Kit accepts it — so a retry after a half-finished sync
 * repeats nothing that landed, and a hundred retries send each tag once.
 */

export const FIELD_LABELS = {
  track: "VU roadmap track",
  status: "VU roadmap status",
  step: "VU roadmap step",
  completed: "VU roadmap completed",
  cadence: "VU roadmap cadence",
} as const;

type FieldName = keyof typeof FIELD_LABELS;

export type RoadmapKitState = {
  fields: Record<FieldName, string>;
  /** The current track's tag, if it has one. */
  trackTags: string[];
  /** Tags for tracks finished — only ever added. */
  completedTags: string[];
};

export type AppliedState = {
  fields: Partial<Record<FieldName, string>>;
  trackTags: string[];
  completedTags: string[];
};

const EMPTY_APPLIED: AppliedState = { fields: {}, trackTags: [], completedTags: [] };

/**
 * A member's roadmap as Kit should see it. Pure.
 *
 * `roadmap` null means not on a (published) track. Completion is the app's own
 * rule: no current milestone left, every one settled.
 */
export function roadmapKitState(
  roadmap: {
    cadence: string;
    paused: boolean;
    track: { slug: string; kitTag: string | null; kitCompletedTag: string | null };
    milestones: { done: boolean; skipped: boolean }[];
  } | null,
): RoadmapKitState {
  if (!roadmap || roadmap.milestones.length === 0) {
    return {
      fields: { track: "", status: "none", step: "", completed: "0", cadence: "" },
      trackTags: [],
      completedTags: [],
    };
  }
  const states = milestoneStates(roadmap.milestones);
  const current = states.indexOf("current");
  const finished = current === -1;
  const total = roadmap.milestones.length;
  const done = states.filter((state) => state === "done").length;
  return {
    fields: {
      track: roadmap.track.slug,
      status: finished ? "completed" : roadmap.paused ? "paused" : "active",
      step: finished ? "" : `${current + 1} of ${total}`,
      completed: String(done),
      cadence: roadmap.cadence,
    },
    trackTags: roadmap.track.kitTag ? [roadmap.track.kitTag] : [],
    completedTags: finished && roadmap.track.kitCompletedTag ? [roadmap.track.kitCompletedTag] : [],
  };
}

export type KitPlan = {
  fields: Partial<Record<FieldName, string>>;
  /** Track tags to add; removed again when the member moves off the track. */
  addTrackTags: string[];
  /** Completion tags to add; never removed. */
  addCompletedTags: string[];
  removeTags: string[];
};

/** What must change in Kit to get from `applied` to `desired`. Pure. */
export function planKitChanges(applied: AppliedState, desired: RoadmapKitState): KitPlan {
  const fields: Partial<Record<FieldName, string>> = {};
  for (const name of Object.keys(desired.fields) as FieldName[]) {
    if (applied.fields[name] !== desired.fields[name]) fields[name] = desired.fields[name];
  }
  const have = new Set([...applied.trackTags, ...applied.completedTags]);
  // A completion tag is never removed, so if one id is used as both a track
  // tag and a completion tag, completion wins.
  const addCompletedTags = [...new Set(desired.completedTags)].filter((tag) => !have.has(tag));
  const addTrackTags = [...new Set(desired.trackTags)].filter(
    (tag) => !have.has(tag) && !addCompletedTags.includes(tag),
  );
  // Only track tags are ever removed, and never one that is also a completion
  // tag the member earned.
  const keep = new Set([...desired.trackTags, ...desired.completedTags, ...applied.completedTags]);
  const removeTags = applied.trackTags.filter((tag) => !keep.has(tag));
  return { fields, addTrackTags, addCompletedTags, removeTags };
}

export function isEmptyPlan(plan: KitPlan): boolean {
  return (
    Object.keys(plan.fields).length === 0 &&
    plan.addTrackTags.length === 0 &&
    plan.addCompletedTags.length === 0 &&
    plan.removeTags.length === 0
  );
}

function readApplied(raw: unknown): AppliedState {
  if (typeof raw !== "object" || raw === null) return EMPTY_APPLIED;
  const value = raw as Record<string, unknown>;
  const strings = (list: unknown) =>
    Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  const fields: Partial<Record<FieldName, string>> = {};
  if (typeof value.fields === "object" && value.fields !== null) {
    for (const name of Object.keys(FIELD_LABELS) as FieldName[]) {
      const field = (value.fields as Record<string, unknown>)[name];
      if (typeof field === "string") fields[name] = field;
    }
  }
  return { fields, trackTags: strings(value.trackTags), completedTags: strings(value.completedTags) };
}

// ---------------------------------------------------------------------------
// Queueing

/**
 * Mark a member's Kit state as behind, and try to catch it up after the
 * response. Never throws: a roadmap action must succeed whether or not Kit is
 * reachable, configured, or the queue write itself fails.
 */
export async function queueRoadmapKitSync(
  userId: string,
  options: {
    /** False leaves it for the sweep — for tests that drive the sync. */
    syncNow?: boolean;
  } = {},
): Promise<void> {
  try {
    await prisma.kitRoadmapSync.upsert({
      where: { userId },
      create: { userId },
      update: {
        version: { increment: 1 },
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    console.error("[kit-roadmap] could not queue sync", { userId, error: describe(error) });
    return;
  }
  if (options.syncNow === false) return;
  await afterResponse(async () => {
    await syncRoadmapToKit({ userIds: [userId] }).catch((error) => {
      console.error("[kit-roadmap] immediate sync failed; the sweep will retry", {
        userId,
        error: describe(error),
      });
    });
  });
}

/**
 * Queue everyone on a track (a track's Kit tags changed, or it was published
 * or withdrawn) — or, with no track, everyone with a roadmap or a sync row.
 * One statement; the sweep does the sending.
 */
export async function queueRoadmapKitSyncForTrack(trackId: string | null): Promise<number> {
  const rows = trackId
    ? await prisma.memberRoadmap.findMany({ where: { trackId }, select: { userId: true }, distinct: ["userId"] })
    : await prisma.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "MemberRoadmap"
        UNION
        SELECT "userId" FROM "KitRoadmapSync"`;
  const userIds = rows.map((row) => row.userId);
  if (userIds.length === 0) return 0;
  await prisma.$executeRaw`
    INSERT INTO "KitRoadmapSync" ("userId", "updatedAt")
    SELECT id, NOW() FROM UNNEST(${userIds}::text[]) AS id
    ON CONFLICT ("userId") DO UPDATE SET
      "version" = "KitRoadmapSync"."version" + 1,
      "status" = 'PENDING',
      "attempts" = 0,
      "nextAttemptAt" = NOW(),
      "lastError" = NULL,
      "updatedAt" = NOW()`;
  return userIds.length;
}

// ---------------------------------------------------------------------------
// Syncing

export const MAX_ATTEMPTS = 6;
const LOCK_MS = 10 * 60 * 1000;

/** 5, 10, 20, 40, 80 minutes, capped at twelve hours. */
export function backoffMs(attempts: number): number {
  return Math.min(5 * 2 ** Math.max(attempts - 1, 0) * 60 * 1000, 12 * 60 * 60 * 1000);
}

export type SyncReport = {
  claimed: number;
  synced: number;
  unchanged: number;
  skipped: number;
  retried: number;
  failed: number;
};

type Outcome =
  | { status: "SYNCED"; applied: AppliedState; subscriberId: string | null; changed: boolean }
  | { status: "SKIPPED"; reason: string; applied: AppliedState; subscriberId: string | null }
  | { status: "RETRY" | "FAILED"; error: string; applied: AppliedState; subscriberId: string | null };

export async function syncRoadmapToKit(
  input: { userIds?: string[]; limit?: number; now?: Date } = {},
  client?: KitClient,
): Promise<SyncReport> {
  const now = input.now ?? new Date();
  const report: SyncReport = { claimed: 0, synced: 0, unchanged: 0, skipped: 0, retried: 0, failed: 0 };

  const due = await prisma.kitRoadmapSync.findMany({
    where: {
      ...(input.userIds ? { userId: { in: input.userIds } } : {}),
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "SYNCING", lockedAt: { lt: new Date(now.getTime() - LOCK_MS) } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.min(input.limit ?? 25, 100),
    select: { userId: true, status: true, lockedAt: true },
  });

  // Claim first: only one worker may sync a member at a time.
  const claimed: { userId: string; version: number; attempts: number; applied: unknown; subscriberId: string | null }[] = [];
  for (const row of due) {
    const won = await prisma.kitRoadmapSync.updateMany({
      where: { userId: row.userId, status: row.status, lockedAt: row.lockedAt },
      data: { status: "SYNCING", lockedAt: now, attempts: { increment: 1 } },
    });
    if (won.count !== 1) continue;
    const fresh = await prisma.kitRoadmapSync.findUnique({
      where: { userId: row.userId },
      select: { userId: true, version: true, attempts: true, applied: true, subscriberId: true },
    });
    if (fresh) claimed.push(fresh);
  }
  report.claimed = claimed.length;
  if (claimed.length === 0) return report;

  const userIds = claimed.map((row) => row.userId);
  const [users, roadmaps] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        status: true,
        emails: { where: { verifiedAt: { not: null } }, select: { email: true } },
      },
    }),
    prisma.memberRoadmap.findMany({
      where: { userId: { in: userIds }, track: { published: true } },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        cadence: true,
        pausedAt: true,
        track: {
          select: {
            slug: true,
            kitTag: true,
            kitCompletedTag: true,
            milestones: { orderBy: { sortOrder: "asc" }, select: { id: true } },
          },
        },
        milestones: { select: { milestoneId: true, completedAt: true, skippedAt: true } },
      },
    }),
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  // The current roadmap is the most recently started one, as on the page.
  const roadmapByUser = new Map<string, (typeof roadmaps)[number]>();
  for (const roadmap of roadmaps) if (!roadmapByUser.has(roadmap.userId)) roadmapByUser.set(roadmap.userId, roadmap);

  const kit = client ?? (kitConfigured() ? httpKitClient() : null);
  let fieldKeys: Map<string, string> | null = null;

  for (const row of claimed) {
    const applied = readApplied(row.applied);
    const roadmap = roadmapByUser.get(row.userId) ?? null;
    const desired = roadmapKitState(
      roadmap
        ? {
            cadence: roadmap.cadence,
            paused: Boolean(roadmap.pausedAt),
            track: roadmap.track,
            milestones: roadmap.track.milestones.map((milestone) => {
              const progress = roadmap.milestones.find((p) => p.milestoneId === milestone.id);
              return { done: Boolean(progress?.completedAt), skipped: Boolean(progress?.skippedAt) };
            }),
          }
        : null,
    );
    const plan = planKitChanges(applied, desired);
    const user = userById.get(row.userId);

    let outcome: Outcome;
    if (isEmptyPlan(plan)) {
      // Nothing to send, so nothing is sent — not even a lookup.
      outcome = { status: "SYNCED", applied, subscriberId: row.subscriberId, changed: false };
    } else if (!kit) {
      outcome = { status: "SKIPPED", reason: "Kit is not configured", applied, subscriberId: row.subscriberId };
    } else if (!user || user.status !== "ACTIVE") {
      outcome = { status: "SKIPPED", reason: "member is not active", applied, subscriberId: row.subscriberId };
    } else {
      outcome = await applyPlan({
        kit,
        plan,
        applied,
        subscriberId: row.subscriberId,
        emails: [user.email, ...user.emails.map((entry) => entry.email)],
        getFieldKeys: async () => (fieldKeys ??= await kit.ensureFields(Object.values(FIELD_LABELS))),
      });
    }

    await record(row, outcome, now);

    if (outcome.status === "SYNCED") {
      if (outcome.changed) report.synced += 1;
      else report.unchanged += 1;
    } else if (outcome.status === "SKIPPED") report.skipped += 1;
    else if (outcome.status === "RETRY" && row.attempts < MAX_ATTEMPTS) report.retried += 1;
    else report.failed += 1;
  }

  return report;
}

async function applyPlan(input: {
  kit: KitClient;
  plan: KitPlan;
  applied: AppliedState;
  subscriberId: string | null;
  emails: string[];
  getFieldKeys: () => Promise<Map<string, string>>;
}): Promise<Outcome> {
  const { kit, plan } = input;
  // Copied, then updated part by part as Kit accepts each one, so a failure
  // half-way records exactly what landed.
  const applied: AppliedState = {
    fields: { ...input.applied.fields },
    trackTags: [...input.applied.trackTags],
    completedTags: [...input.applied.completedTags],
  };
  let subscriberId = input.subscriberId;

  try {
    // Identity: the subscriber we matched before, or the member's own
    // addresses (primary first, then verified extras) — the same email match
    // billing reconciliation uses. The state is re-read every time, so an
    // unsubscribe in Kit is honoured from the next sync on.
    let subscriber = subscriberId ? await kit.getSubscriber(subscriberId) : null;
    if (!subscriber) {
      for (const email of [...new Set(input.emails.map((e) => e.toLowerCase()))]) {
        subscriber = await kit.findSubscriber(email);
        if (subscriber) break;
      }
    }
    if (!subscriber) {
      return { status: "SKIPPED", reason: "not a Kit subscriber", applied, subscriberId: null };
    }
    subscriberId = subscriber.id;
    if (subscriber.state !== "active") {
      return { status: "SKIPPED", reason: `Kit subscriber is ${subscriber.state || "inactive"}`, applied, subscriberId };
    }

    if (Object.keys(plan.fields).length > 0) {
      const keys = await input.getFieldKeys();
      const payload: Record<string, string> = {};
      for (const [name, value] of Object.entries(plan.fields) as [FieldName, string][]) {
        const key = keys.get(FIELD_LABELS[name]);
        if (key) payload[key] = value;
      }
      if (Object.keys(payload).length > 0) await kit.updateFields(subscriberId, payload);
      Object.assign(applied.fields, plan.fields);
    }

    // The tag endpoint takes an address. It must be the one Kit already has
    // for this subscriber: any other would create a second subscriber.
    const email = subscriber.email;
    for (const tag of plan.addCompletedTags) {
      await kit.addTag(tag, email);
      applied.completedTags = [...applied.completedTags, tag];
    }
    for (const tag of plan.addTrackTags) {
      await kit.addTag(tag, email);
      applied.trackTags = [...applied.trackTags, tag];
    }
    for (const tag of plan.removeTags) {
      await kit.removeTag(subscriberId, tag);
      applied.trackTags = applied.trackTags.filter((item) => item !== tag);
    }
    return { status: "SYNCED", applied, subscriberId, changed: true };
  } catch (error) {
    const message = describe(error);
    const transient = !(error instanceof KitApiError) || error.transient;
    return { status: transient ? "RETRY" : "FAILED", error: message, applied, subscriberId };
  }
}

async function record(
  row: { userId: string; version: number; attempts: number },
  outcome: Outcome,
  now: Date,
) {
  const base = {
    applied: outcome.applied as unknown as Prisma.InputJsonValue,
    subscriberId: outcome.subscriberId,
    lockedAt: null,
  };

  let status: KitSyncStatus;
  let extra: Prisma.KitRoadmapSyncUpdateManyMutationInput = {};
  if (outcome.status === "SYNCED") {
    status = "SYNCED";
    extra = { syncedVersion: row.version, lastSyncedAt: now, lastError: null, attempts: 0 };
  } else if (outcome.status === "SKIPPED") {
    status = "SKIPPED";
    extra = { syncedVersion: row.version, lastError: outcome.reason, attempts: 0 };
  } else if (outcome.status === "RETRY" && row.attempts < MAX_ATTEMPTS) {
    status = "PENDING";
    extra = { lastError: outcome.error, nextAttemptAt: new Date(now.getTime() + backoffMs(row.attempts)) };
  } else {
    status = "FAILED";
    extra = { lastError: outcome.error };
  }

  // Only settle the row if no newer change arrived while this ran; if one did,
  // it stays PENDING for the next pass with what landed recorded.
  const settled = await prisma.kitRoadmapSync.updateMany({
    where: { userId: row.userId, version: row.version },
    data: { ...base, ...extra, status },
  });
  if (settled.count === 0) {
    await prisma.kitRoadmapSync.update({
      where: { userId: row.userId },
      data: { ...base, status: "PENDING", nextAttemptAt: now, attempts: 0 },
    });
  }

  // The audit trail, in the same table billing's Kit sync writes to. Only
  // what changed — never the member's address.
  if (outcome.status === "SYNCED" && !outcome.changed) return;
  await prisma.kitSyncLog
    .create({
      data: {
        userId: row.userId,
        action: "kit.roadmap.sync",
        success: outcome.status === "SYNCED",
        error:
          outcome.status === "SKIPPED"
            ? `skipped: ${outcome.reason}`
            : outcome.status === "RETRY" || outcome.status === "FAILED"
              ? outcome.error.slice(0, 500)
              : null,
        payload: {
          status: status,
          version: row.version,
          attempt: row.attempts,
          fields: outcome.applied.fields,
          trackTags: outcome.applied.trackTags,
          completedTags: outcome.applied.completedTags,
        },
      },
    })
    .catch((error) => console.error("[kit-roadmap] could not write log", describe(error)));

  if (status === "FAILED" || status === "PENDING") {
    console.error("[kit-roadmap] sync did not complete", {
      userId: row.userId,
      status,
      attempt: row.attempts,
      error: outcome.status === "RETRY" || outcome.status === "FAILED" ? outcome.error : undefined,
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}
