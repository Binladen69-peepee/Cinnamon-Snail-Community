import type { NotificationCategory, NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { afterResponse } from "@/lib/after-response";
import { parsePrefs, wants, type NotificationPrefs } from "@/lib/notifications/preferences";

/**
 * The one way a notification is created.
 *
 * Every trigger in the app — replies, mentions, DMs, space posts, events,
 * badges, the bulletin board — ends up here, so these rules hold everywhere
 * rather than wherever someone remembered them:
 *
 * - **Nobody is notified about their own action**, and nobody is notified
 *   about someone they have blocked.
 * - **Each channel follows the member's own preference.** In-app, email and
 *   push are decided separately; a category muted in-app but wanted by email
 *   still writes a row (hidden from the inbox) so the email has something to
 *   deliver.
 * - **Idempotent.** A draft with a `dedupeKey` can produce one notification per
 *   member, ever. A retried job, an overlapping cron run or an edited post hits
 *   the unique index and writes nothing.
 * - **Email and push go only to active members.** A suspended account still
 *   sees its inbox if it signs in, but nothing is sent to it.
 * - **Bulk.** Preferences, statuses, blocks and push subscriptions are read in
 *   one query each, rows are written in one statement, and the delivery outbox
 *   in a second — inside one transaction, so a notification never exists
 *   without the deliveries it promised.
 *
 * Sending is not done here. The outbox rows are picked up right after the
 * response (and by the cron sweep for anything that failed), so a slow mail
 * provider never slows down posting a comment.
 */

export type NotificationDraft = {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string;
  /** Stable id of the source event, e.g. `mention:post:<id>`. */
  dedupeKey?: string;
  /** Who caused it. Used to skip self-notifications and blocked senders. */
  actorId?: string;
};

export type DispatchResult = { created: number; deliveries: number };

export type ChannelPlan = { inApp: boolean; email: boolean; push: boolean };

/**
 * Which channels a draft goes to. Pure, so the rules can be tested without a
 * database.
 */
export function planChannels(input: {
  category: NotificationCategory;
  prefs: NotificationPrefs;
  active: boolean;
  hasEmail: boolean;
  hasPush: boolean;
}): ChannelPlan {
  return {
    inApp: wants(input.prefs, "inApp", input.category),
    email: input.active && input.hasEmail && wants(input.prefs, "email", input.category),
    push: input.active && input.hasPush && wants(input.prefs, "push", input.category),
  };
}

export async function dispatchNotifications(
  drafts: NotificationDraft[],
  options: {
    /** False leaves the outbox for the sweep — for tests that drive delivery. */
    deliverNow?: boolean;
  } = {},
): Promise<DispatchResult> {
  // Self-notifications go, and a batch can only name a source once per member.
  const seen = new Set<string>();
  const candidates = drafts.filter((draft) => {
    if (!draft.userId || draft.userId === draft.actorId) return false;
    if (!draft.dedupeKey) return true;
    const key = `${draft.userId}\u0000${draft.dedupeKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (candidates.length === 0) return { created: 0, deliveries: 0 };

  const userIds = [...new Set(candidates.map((draft) => draft.userId))];
  const actorIds = [
    ...new Set(candidates.map((draft) => draft.actorId).filter((id): id is string => Boolean(id))),
  ];

  const [users, blocks, subscribed] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, status: true, email: true, profile: { select: { notificationPrefs: true } } },
    }),
    actorIds.length
      ? prisma.userBlock.findMany({
          where: { blockerId: { in: userIds }, blockedId: { in: actorIds } },
          select: { blockerId: true, blockedId: true },
        })
      : Promise.resolve([]),
    prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const byId = new Map(users.map((user) => [user.id, user]));
  const blocked = new Set(blocks.map((row) => `${row.blockerId}\u0000${row.blockedId}`));
  const withPush = new Set(subscribed.map((row) => row.userId));

  const plans = new Map<string, ChannelPlan>();
  const planFor = (userId: string, category: NotificationCategory): ChannelPlan | null => {
    const key = `${userId}\u0000${category}`;
    if (plans.has(key)) return plans.get(key)!;
    const user = byId.get(userId);
    // A member who no longer exists gets nothing.
    const plan = user
      ? planChannels({
          category,
          prefs: parsePrefs(user.profile?.notificationPrefs),
          active: user.status === "ACTIVE",
          hasEmail: Boolean(user.email),
          hasPush: withPush.has(userId),
        })
      : null;
    plans.set(key, plan as ChannelPlan);
    return plan;
  };

  const allowed = candidates.filter((draft) => {
    if (draft.actorId && blocked.has(`${draft.userId}\u0000${draft.actorId}`)) return false;
    const plan = planFor(draft.userId, draft.category);
    return Boolean(plan && (plan.inApp || plan.email || plan.push));
  });
  if (allowed.length === 0) return { created: 0, deliveries: 0 };

  const { created, deliveries, notificationIds } = await prisma.$transaction(async (tx) => {
    const rows = await tx.notification.createManyAndReturn({
      data: allowed.map((draft) => ({
        userId: draft.userId,
        channel: "IN_APP" as const,
        category: draft.category,
        title: draft.title.slice(0, 200),
        body: draft.body.slice(0, 1000),
        href: draft.href,
        dedupeKey: draft.dedupeKey ?? null,
        inApp: planFor(draft.userId, draft.category)!.inApp,
      })),
      skipDuplicates: true,
      select: { id: true, userId: true, category: true },
    });

    const outbox: { notificationId: string; channel: NotificationChannel }[] = [];
    for (const row of rows) {
      const plan = planFor(row.userId, row.category)!;
      if (plan.email) outbox.push({ notificationId: row.id, channel: "EMAIL" });
      if (plan.push) outbox.push({ notificationId: row.id, channel: "WEB_PUSH" });
    }
    if (outbox.length) {
      await tx.notificationDelivery.createMany({ data: outbox, skipDuplicates: true });
    }
    return {
      created: rows.length,
      deliveries: outbox.length,
      notificationIds: [...new Set(outbox.map((item) => item.notificationId))],
    };
  });

  if (notificationIds.length && options.deliverNow !== false) {
    // Imported lazily: delivery pulls in the mail and push senders, which the
    // many callers that only ever write in-app rows have no reason to load.
    await afterResponse(async () => {
      const { processDeliveries } = await import("@/lib/notifications/delivery");
      await processDeliveries({ notificationIds }).catch((error) => {
        console.error("[notifications] immediate delivery failed; the sweep will retry", error);
      });
      // Piggyback a small retry pass. The cron sweep is daily on the current
      // Vercel plan, so retries that are due also ride on ordinary traffic.
      // Production only: anywhere else it would claim rows that a test or a
      // script is driving itself.
      if (process.env.NODE_ENV === "production") {
        await processDeliveries({ limit: 20 }).catch(() => undefined);
      }
    });
  }

  return { created, deliveries };
}

/** A single notification. Returns whether anything was written. */
export async function dispatchNotification(draft: NotificationDraft): Promise<boolean> {
  const result = await dispatchNotifications([draft]);
  return result.created > 0;
}
