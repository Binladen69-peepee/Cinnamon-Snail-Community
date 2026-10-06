import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { uniqueEventSlug } from "@/lib/events/slug";
import { indexEvent, unindexEvent } from "@/lib/events/search";
import {
  announceEventCanceled,
  announceEventMoved,
  resetEventReminders,
} from "@/lib/events/notify";
import { readZoomConfig, type ZoomConfig } from "@/lib/zoom/config";
import {
  ZoomApiError,
  createZoomClient,
  describeZoomError,
  type ZoomClient,
  type ZoomListedMeeting,
  type ZoomMeetingDetail,
  type ZoomUser,
} from "@/lib/zoom/client";
import {
  ZOOM_RECURRING_FIXED,
  ZOOM_SCHEDULED,
  decideMissing,
  expandMeeting,
  isLiveClassTopic,
  singleOccurrence,
  zoomChanges,
  type LiveClassOccurrence,
  type MissingVerdict,
} from "@/lib/zoom/live-class";

/**
 * Keeping Live Classes in step with Zoom (DEC-079).
 *
 * Two ways in, one set of rules:
 *
 * - `runZoomSync` reads every configured user's upcoming meetings (the daily
 *   job, the hourly refresh a visit starts, and the admin's "Sync from Zoom
 *   now"), upserts a class for every
 *   LIVE CLASS occurrence, and then asks Zoom about each future class the list
 *   did not mention.
 * - `syncZoomMeeting` does the same for one meeting, when the webhook says it
 *   was created, changed or deleted.
 *
 * What it promises:
 *
 * - **Idempotent.** Rows are keyed by `zoomKey`; an unchanged meeting writes
 *   nothing (not even `updatedAt`), so the second of two identical runs
 *   reports no changes. Two runs racing on a new meeting create one row.
 * - **Zoom owns only what Zoom knows.** See `zoomChanges`: title, time, length,
 *   zone, link, and the agenda while staff have written no description.
 * - **Canceled, never deleted, and only on Zoom's word.** A class is canceled
 *   when Zoom answers 404 for its meeting or says its occurrence is deleted or
 *   gone. Its RSVPs, posts and recording stay; the people coming are told. A
 *   failed list skips the cancellation pass entirely, and a failed lookup
 *   leaves that meeting's classes exactly as they were.
 * - **Every run is recorded** as a `ZoomSyncRun`, so staff can see when Zoom
 *   was last read and what it changed, and a failing sync is visible.
 */

export const ZOOM_NOT_CONFIGURED = "Zoom is not configured.";

/** How far ahead a recurring series becomes classes. The rest follow later. */
export const ZOOM_HORIZON_MS = 180 * 24 * 60 * 60_000;

/** "visit" is the hourly refresh a member opening Live Classes starts. */
export type ZoomSyncTrigger = "cron" | "webhook" | "manual" | "visit";

export type ZoomSyncResult = {
  configured: boolean;
  /** True when the run finished with no errors. */
  ok: boolean;
  runId: string | null;
  scanned: number;
  created: number;
  updated: number;
  canceled: number;
  errors: string[];
  /** Slugs of every class this run wrote, for revalidation. */
  changed: string[];
};

export type ZoomSyncOptions = {
  trigger: ZoomSyncTrigger;
  /** Defaults to the environment. Pass null to behave as unconfigured. */
  config?: ZoomConfig | null;
  /** Defaults to a real client built from `config`. Tests pass a fake. */
  client?: ZoomClient;
  now?: Date;
};

type HostInfo = { name: string | null; email: string | null; timezone: string | null };

type Context = {
  client: ZoomClient;
  trigger: ZoomSyncTrigger;
  now: Date;
  counts: { scanned: number; created: number; updated: number; canceled: number };
  errors: string[];
  /** Every key Zoom confirmed this run. */
  seen: Set<string>;
  changed: Set<string>;
  zoomUsers: Map<string, Promise<HostInfo>>;
  memberHosts: Map<string, Promise<string | null>>;
};

/** A Zoom user, said as a host. Never more than a name, an email and a zone. */
function hostFromUser(user: ZoomUser | null, userKey: string): HostInfo {
  const display = user?.display_name?.trim();
  const full = [user?.first_name, user?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const name = display || full || null;
  const email =
    user?.email?.trim().toLowerCase() || (userKey.includes("@") ? userKey.trim().toLowerCase() : null);
  return {
    name: name ? name.slice(0, 120) : null,
    email,
    timezone: user?.timezone?.trim() || null,
  };
}

function hostForZoomUser(ctx: Context, userKey: string): Promise<HostInfo> {
  let pending = ctx.zoomUsers.get(userKey);
  if (!pending) {
    pending = ctx.client
      .getUser(userKey)
      .catch(() => null)
      .then((user) => hostFromUser(user, userKey));
    ctx.zoomUsers.set(userKey, pending);
  }
  return pending;
}

/**
 * The member a host email belongs to, when that member hosts or runs the
 * school. A Zoom account's email matching an ordinary member's is not a reason
 * to show them as the host of a class.
 */
function memberHostFor(ctx: Context, email: string): Promise<string | null> {
  const key = email.toLowerCase();
  let pending = ctx.memberHosts.get(key);
  if (!pending) {
    pending = prisma.user
      .findFirst({
        where: {
          status: "ACTIVE",
          roles: { some: { role: { name: { in: ["HOST", "ADMIN", "SUPER_ADMIN"] } } } },
          OR: [
            { email: { equals: key, mode: "insensitive" } },
            { emails: { some: { email: { equals: key, mode: "insensitive" } } } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      .then((user) => user?.id ?? null)
      .catch(() => null);
    ctx.memberHosts.set(key, pending);
  }
  return pending;
}

const ROW_SELECT = {
  id: true,
  slug: true,
  status: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  zoomUrl: true,
  hostId: true,
  hostName: true,
  zoomHostEmail: true,
  zoomMeetingId: true,
  zoomOccurrenceId: true,
} as const;

type ClassRow = Prisma.EventGetPayload<{ select: typeof ROW_SELECT }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function createClass(
  ctx: Context,
  incoming: LiveClassOccurrence & { hostName: string | null; matchedHostId: string | null },
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const base = await uniqueEventSlug(incoming.title, incoming.startsAt);
    const slug = attempt === 0 ? base : `${base}-${Date.now().toString(36)}`;
    try {
      const row = await prisma.event.create({
        data: {
          slug,
          source: "ZOOM",
          status: "PUBLISHED",
          title: incoming.title,
          description: incoming.agenda,
          startsAt: incoming.startsAt,
          endsAt: incoming.endsAt,
          timezone: incoming.timezone,
          zoomUrl: incoming.joinUrl,
          zoomMeetingId: incoming.meetingId,
          zoomOccurrenceId: incoming.occurrenceId,
          zoomKey: incoming.key,
          hostName: incoming.hostName,
          zoomHostEmail: incoming.hostEmail,
          hostId: incoming.matchedHostId,
          zoomLastSeenAt: ctx.now,
          zoomSyncedAt: ctx.now,
        },
        select: { id: true, slug: true },
      });
      ctx.counts.created += 1;
      ctx.changed.add(row.slug);
      await indexEvent(row.id).catch(() => undefined);
      await writeAuditLog({
        actorId: null,
        action: "event.zoom_created",
        targetType: "Event",
        targetId: row.id,
        metadata: { slug: row.slug, zoomKey: incoming.key, trigger: ctx.trigger },
      }).catch(() => undefined);
      return true;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Either another run created this class a moment ago (the caller then
      // updates it), or the slug was taken in between (try once more).
      const raced = await prisma.event.findUnique({
        where: { zoomKey: incoming.key },
        select: { id: true },
      });
      if (raced) return false;
    }
  }
  return false;
}

async function updateClass(
  ctx: Context,
  row: ClassRow,
  incoming: LiveClassOccurrence & { hostName: string | null; matchedHostId: string | null },
): Promise<void> {
  const changes = zoomChanges(row, incoming);
  if (Object.keys(changes.data).length === 0) return;

  await prisma.event.update({
    where: { id: row.id },
    data: { ...changes.data, zoomSyncedAt: ctx.now },
  });
  ctx.counts.updated += 1;
  ctx.changed.add(row.slug);

  if (changes.reindex) await indexEvent(row.id).catch(() => undefined);

  if (
    changes.moved &&
    row.status === "PUBLISHED" &&
    incoming.startsAt.getTime() > ctx.now.getTime()
  ) {
    // New time, new reminders; and the people coming hear about it once.
    await resetEventReminders(row.id).catch(() => undefined);
    await announceEventMoved({
      id: row.id,
      slug: row.slug,
      title: incoming.title,
      startsAt: incoming.startsAt,
      timezone: incoming.timezone,
    }).catch(() => undefined);
  }
}

/** Create or update the class for one occurrence. */
async function upsertClass(
  ctx: Context,
  occurrence: LiveClassOccurrence,
  host: HostInfo | null,
): Promise<void> {
  ctx.seen.add(occurrence.key);
  const hostEmail = occurrence.hostEmail ?? host?.email ?? null;
  const incoming = {
    ...occurrence,
    hostEmail,
    hostName: host?.name ?? null,
    matchedHostId: hostEmail ? await memberHostFor(ctx, hostEmail) : null,
  };

  let row = await prisma.event.findUnique({
    where: { zoomKey: occurrence.key },
    select: ROW_SELECT,
  });
  if (!row) {
    if (await createClass(ctx, incoming)) return;
    row = await prisma.event.findUnique({
      where: { zoomKey: occurrence.key },
      select: ROW_SELECT,
    });
    if (!row) return;
  }
  await updateClass(ctx, row, incoming);
}

type FutureRow = {
  id: string;
  slug: string;
  title: string;
  zoomKey: string | null;
  zoomMeetingId: string | null;
  zoomOccurrenceId: string | null;
};

/** Future, published Zoom classes: the only rows a sync may cancel. */
async function futureClasses(ctx: Context, meetingId?: string): Promise<FutureRow[]> {
  return prisma.event.findMany({
    where: {
      source: "ZOOM",
      status: "PUBLISHED",
      startsAt: { gt: ctx.now },
      zoomKey: { not: null },
      zoomMeetingId: meetingId ?? { not: null },
    },
    orderBy: { startsAt: "asc" },
    take: 1000,
    select: {
      id: true,
      slug: true,
      title: true,
      zoomKey: true,
      zoomMeetingId: true,
      zoomOccurrenceId: true,
    },
  });
}

async function cancelClass(
  ctx: Context,
  row: FutureRow,
  reason: Extract<MissingVerdict, { action: "cancel" }>["reason"],
): Promise<void> {
  // Conditional, so two runs canceling at once tell people once.
  const result = await prisma.event.updateMany({
    where: { id: row.id, status: "PUBLISHED", source: "ZOOM" },
    data: { status: "CANCELED", zoomSyncedAt: ctx.now },
  });
  if (result.count === 0) return;

  ctx.counts.canceled += 1;
  ctx.changed.add(row.slug);
  await unindexEvent(row.slug).catch(() => undefined);
  await announceEventCanceled(row, { once: true }).catch(() => undefined);
  await writeAuditLog({
    actorId: null,
    action: "event.zoom_canceled",
    targetType: "Event",
    targetId: row.id,
    metadata: { slug: row.slug, zoomKey: row.zoomKey, reason, trigger: ctx.trigger },
  }).catch(() => undefined);
}

/**
 * Bring one meeting's classes in line with Zoom's own record of it.
 *
 * `detail` null means Zoom said 404, which is the one answer that cancels
 * everything still to come from that meeting.
 */
async function reconcileMeeting(
  ctx: Context,
  meetingId: string,
  detail: ZoomMeetingDetail | null,
  knownHost: HostInfo | null,
): Promise<void> {
  if (detail === null) {
    for (const row of await futureClasses(ctx, meetingId)) {
      await cancelClass(ctx, row, "meeting-deleted");
    }
    return;
  }

  const host =
    knownHost ?? (detail.host_id ? await hostForZoomUser(ctx, detail.host_id) : null);
  const zone = host?.timezone ?? "UTC";

  if (isLiveClassTopic(detail.topic)) {
    const expansion = expandMeeting(detail, {
      now: ctx.now,
      horizonMs: ZOOM_HORIZON_MS,
      fallbackTimeZone: zone,
    });
    for (const occurrence of expansion.classes) {
      await upsertClass(ctx, occurrence, host);
    }
  }

  // Whatever Zoom's answer did not produce: deleted, gone, or out of range.
  for (const row of await futureClasses(ctx, meetingId)) {
    if (row.zoomKey && ctx.seen.has(row.zoomKey)) continue;
    const verdict = decideMissing(detail, row, zone);
    if (verdict.action === "cancel") {
      await cancelClass(ctx, row, verdict.reason);
    } else if (verdict.action === "refresh") {
      await upsertClass(ctx, verdict.occurrence, host);
    }
  }
}

/** Remember when each class was last confirmed, without touching `updatedAt`. */
async function markSeen(ctx: Context): Promise<void> {
  const keys = [...ctx.seen];
  for (let index = 0; index < keys.length; index += 500) {
    const chunk = keys.slice(index, index + 500);
    await prisma.$executeRaw`
      UPDATE "Event" SET "zoomLastSeenAt" = ${ctx.now}
      WHERE "zoomKey" IN (${Prisma.join(chunk)})
    `;
  }
}

function userLabel(userKey: string): string {
  if (userKey === "me") return "the app's own user";
  if (userKey.includes("@")) {
    const [local, domain] = userKey.split("@");
    return `${(local ?? "").slice(0, 2)}…@${domain ?? ""}`;
  }
  return `user ${userKey.slice(0, 6)}…`;
}

/**
 * The run when Zoom is not set up: one row saying so. Consecutive runs refresh
 * that row rather than writing a new one each time.
 */
async function recordNotConfigured(trigger: ZoomSyncTrigger): Promise<string | null> {
  try {
    const latest = await prisma.zoomSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { id: true, error: true },
    });
    if (latest?.error === ZOOM_NOT_CONFIGURED) {
      await prisma.zoomSyncRun.update({
        where: { id: latest.id },
        data: { finishedAt: new Date() },
      });
      return latest.id;
    }
    const run = await prisma.zoomSyncRun.create({
      data: { trigger, finishedAt: new Date(), error: ZOOM_NOT_CONFIGURED },
      select: { id: true },
    });
    return run.id;
  } catch {
    return null;
  }
}

function emptyResult(configured: boolean, runId: string | null, errors: string[]): ZoomSyncResult {
  return {
    configured,
    ok: false,
    runId,
    scanned: 0,
    created: 0,
    updated: 0,
    canceled: 0,
    errors,
    changed: [],
  };
}

type Started = { ctx: Context; config: ZoomConfig; runId: string };

async function start(options: ZoomSyncOptions): Promise<Started | ZoomSyncResult> {
  const config = options.config === undefined ? readZoomConfig() : options.config;
  if (!config) {
    return emptyResult(false, await recordNotConfigured(options.trigger), [ZOOM_NOT_CONFIGURED]);
  }
  const now = options.now ?? new Date();
  const run = await prisma.zoomSyncRun.create({
    data: { trigger: options.trigger, startedAt: now },
    select: { id: true },
  });
  return {
    config,
    runId: run.id,
    ctx: {
      client: options.client ?? createZoomClient({ config }),
      trigger: options.trigger,
      now,
      counts: { scanned: 0, created: 0, updated: 0, canceled: 0 },
      errors: [],
      seen: new Set(),
      changed: new Set(),
      zoomUsers: new Map(),
      memberHosts: new Map(),
    },
  };
}

async function finish(ctx: Context, runId: string): Promise<ZoomSyncResult> {
  const error = ctx.errors.length > 0 ? ctx.errors.join(" · ").slice(0, 1000) : null;
  await prisma.zoomSyncRun
    .update({
      where: { id: runId },
      data: { finishedAt: new Date(), ...ctx.counts, error },
    })
    .catch(() => undefined);
  return {
    configured: true,
    ok: ctx.errors.length === 0,
    runId,
    ...ctx.counts,
    errors: ctx.errors,
    changed: [...ctx.changed],
  };
}

/** Read every configured user's upcoming meetings and bring the classes in line. */
export async function runZoomSync(options: ZoomSyncOptions): Promise<ZoomSyncResult> {
  const started = await start(options);
  if (!("ctx" in started)) return started;
  const { ctx, config, runId } = started;

  try {
    // 1. Everything Zoom lists, LIVE CLASS meetings only, once per meeting.
    let listComplete = true;
    const listed = new Map<string, { entry: ZoomListedMeeting; userKey: string }>();
    for (const userKey of config.userIds) {
      let entries: ZoomListedMeeting[];
      try {
        entries = await ctx.client.listUpcomingMeetings(userKey);
      } catch (error) {
        listComplete = false;
        ctx.errors.push(`Could not list meetings for ${userLabel(userKey)}: ${describeZoomError(error)}`);
        continue;
      }
      for (const entry of entries) {
        if (!isLiveClassTopic(entry.topic)) continue;
        const id = String(entry.id);
        if (!listed.has(id)) listed.set(id, { entry, userKey });
      }
    }

    // 2. Each listed meeting. A single meeting is all in the list; a series
    //    needs Zoom's record of its occurrences.
    const reconciled = new Set<string>();
    const unsure = new Set<string>();
    for (const [meetingId, { entry, userKey }] of listed) {
      ctx.counts.scanned += 1;
      const host = await hostForZoomUser(ctx, userKey);
      if (entry.type === ZOOM_RECURRING_FIXED) {
        let detail: ZoomMeetingDetail | null;
        try {
          detail = await ctx.client.getMeeting(meetingId, { showPreviousOccurrences: true });
        } catch (error) {
          unsure.add(meetingId);
          ctx.errors.push(`Could not read meeting ${meetingId}: ${describeZoomError(error)}`);
          continue;
        }
        await reconcileMeeting(ctx, meetingId, detail, host);
        reconciled.add(meetingId);
      } else if (entry.type === ZOOM_SCHEDULED || entry.type === undefined) {
        const occurrence = singleOccurrence(entry, host.timezone ?? "UTC");
        if (occurrence && occurrence.endsAt.getTime() > ctx.now.getTime()) {
          await upsertClass(ctx, occurrence, host);
        }
      }
    }

    // 3. Future classes the list did not mention. Never after a failed list:
    //    a missing page is not a deleted meeting.
    if (listComplete) {
      const missing = new Set<string>();
      for (const row of await futureClasses(ctx)) {
        if (!row.zoomMeetingId || (row.zoomKey && ctx.seen.has(row.zoomKey))) continue;
        if (reconciled.has(row.zoomMeetingId) || unsure.has(row.zoomMeetingId)) continue;
        missing.add(row.zoomMeetingId);
      }
      for (const meetingId of missing) {
        ctx.counts.scanned += 1;
        let detail: ZoomMeetingDetail | null;
        try {
          detail = await ctx.client.getMeeting(meetingId, { showPreviousOccurrences: true });
        } catch (error) {
          ctx.errors.push(`Could not check meeting ${meetingId}: ${describeZoomError(error)}`);
          continue;
        }
        await reconcileMeeting(ctx, meetingId, detail, null);
      }
    }

    await markSeen(ctx);
  } catch (error) {
    ctx.errors.push(unexpected(error));
  }

  return finish(ctx, runId);
}

/**
 * A failure nobody planned for (a database outage, a bug), recorded on the run
 * and logged by message only. Zoom's own failures are caught where they
 * happen, with the meeting they belong to.
 */
function unexpected(error: unknown): string {
  if (error instanceof ZoomApiError) return describeZoomError(error);
  console.error(
    "[zoom] sync stopped:",
    error instanceof Error ? error.message.slice(0, 300) : "unknown error",
  );
  return "The sync stopped on an unexpected error. Nothing after it was changed.";
}

/** Bring one meeting's classes in line: the webhook's targeted sync. */
export async function syncZoomMeeting(
  meetingId: string,
  options: ZoomSyncOptions,
): Promise<ZoomSyncResult> {
  if (!/^\d{5,20}$/.test(meetingId)) {
    return emptyResult(true, null, ["Not a Zoom meeting id."]);
  }
  const started = await start(options);
  if (!("ctx" in started)) return started;
  const { ctx, runId } = started;

  try {
    ctx.counts.scanned = 1;
    let detail: ZoomMeetingDetail | null;
    try {
      detail = await ctx.client.getMeeting(meetingId, { showPreviousOccurrences: true });
    } catch (error) {
      ctx.errors.push(`Could not read meeting ${meetingId}: ${describeZoomError(error)}`);
      return finish(ctx, runId);
    }
    await reconcileMeeting(ctx, meetingId, detail, null);
    await markSeen(ctx);
  } catch (error) {
    ctx.errors.push(unexpected(error));
  }

  return finish(ctx, runId);
}

/**
 * Whether a webhook about this meeting is worth a call to Zoom: it says LIVE
 * CLASS now, or it was a class before. Anything else is somebody's ordinary
 * meeting, and the webhook answers without reading it.
 */
export async function webhookConcernsLiveClass(
  meetingId: string,
  topic: string | null,
): Promise<boolean> {
  if (topic && isLiveClassTopic(topic)) return true;
  const known = await prisma.event.findFirst({
    where: { source: "ZOOM", zoomMeetingId: meetingId },
    select: { id: true },
  });
  return known !== null;
}
