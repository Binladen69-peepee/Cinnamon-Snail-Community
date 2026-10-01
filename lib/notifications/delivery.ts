import type { DeliveryStatus, NotificationCategory, NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EmailSendError, sendTransactionalEmail } from "@/lib/email/send";
import { renderNotificationEmail } from "@/lib/notifications/email";
import { outsideBody, safePath } from "@/lib/notifications/content";
import { parsePrefs, wants } from "@/lib/notifications/preferences";
import {
  pushConfigured,
  sendPush,
  type PushOutcome,
  type PushPayload,
  type PushTarget,
} from "@/lib/notifications/push";

/**
 * Sends what is in the outbox.
 *
 * Called twice over: right after the request that created the notification,
 * for the notifications it just wrote, and by the cron sweep for anything due.
 * Either can run at the same time as the other, or as itself, because every
 * row is **claimed** before it is sent — a conditional update from PENDING to
 * SENDING that only one caller can win. A worker that dies mid-send leaves a
 * row SENDING with a lock time; once the lock is stale the sweep reclaims it.
 *
 * Failure is graded:
 * - transient (network, 429, 5xx): back off exponentially and try again, up to
 *   five attempts, then FAILED;
 * - permanent (a refused address, an unverified sender, no browser left to
 *   push to): FAILED immediately, because retrying only repeats the refusal;
 * - no longer wanted (the member switched the category off, or was suspended,
 *   since it was queued): SKIPPED. Preferences are re-read at send time.
 *
 * Emails about the same thing collapse: a second email pointing at the same
 * page within fifteen minutes is skipped, so a burst of messages in one thread
 * is one email rather than ten. Push is not collapsed — the browser replaces a
 * notification with the same tag instead.
 */

export const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const COLLAPSE_MS = 15 * 60 * 1000;

/** 2, 4, 8, 16 minutes… capped at six hours. */
export function backoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(attempts, 1) * 60 * 1000, 6 * 60 * 60 * 1000);
}

export type SendOutcome =
  | { status: "SENT" }
  | { status: "RETRY"; error: string }
  | { status: "FAILED"; error: string }
  | { status: "SKIPPED"; error: string };

/** What happens to a row after an attempt. Pure. */
export function nextState(
  outcome: SendOutcome,
  attempts: number,
  now: Date,
): { status: DeliveryStatus; nextAttemptAt?: Date; lastError: string | null; sentAt?: Date } {
  switch (outcome.status) {
    case "SENT":
      return { status: "SENT", lastError: null, sentAt: now };
    case "SKIPPED":
      return { status: "SKIPPED", lastError: outcome.error };
    case "FAILED":
      return { status: "FAILED", lastError: outcome.error };
    case "RETRY":
      return attempts >= MAX_ATTEMPTS
        ? { status: "FAILED", lastError: outcome.error }
        : {
            status: "PENDING",
            lastError: outcome.error,
            nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
          };
  }
}

export type DeliveryTransport = {
  email: (message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
  }) => Promise<SendOutcome>;
  push: (target: PushTarget, payload: PushPayload) => Promise<PushOutcome>;
  pushEnabled: () => boolean;
};

const defaultTransport: DeliveryTransport = {
  async email(message) {
    if (process.env.NODE_ENV === "production" && !process.env.RESEND_API_KEY) {
      return { status: "SKIPPED", error: "email not configured" };
    }
    try {
      const result = await sendTransactionalEmail(message);
      return result.delivered
        ? { status: "SENT" }
        : { status: "SKIPPED", error: "development inbox" };
    } catch (error) {
      const text = error instanceof Error ? error.message.slice(0, 300) : "email failed";
      if (error instanceof EmailSendError && error.permanent) return { status: "FAILED", error: text };
      return { status: "RETRY", error: text };
    }
  },
  push: sendPush,
  pushEnabled: pushConfigured,
};

type Claimed = {
  id: string;
  channel: NotificationChannel;
  attempts: number;
  notification: {
    id: string;
    userId: string;
    category: NotificationCategory;
    title: string;
    body: string;
    href: string | null;
    user: {
      email: string;
      status: string;
      name: string | null;
      profile: { displayName: string | null; notificationPrefs: unknown } | null;
    };
  };
};

export type DeliveryReport = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
};

export async function processDeliveries(
  input: { notificationIds?: string[]; limit?: number; now?: Date } = {},
  transport: DeliveryTransport = defaultTransport,
): Promise<DeliveryReport> {
  const now = input.now ?? new Date();
  const report: DeliveryReport = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };

  const due = await prisma.notificationDelivery.findMany({
    where: {
      ...(input.notificationIds ? { notificationId: { in: input.notificationIds } } : {}),
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "SENDING", lockedAt: { lt: new Date(now.getTime() - LOCK_MS) } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: Math.min(input.limit ?? 100, 500),
    select: { id: true, status: true, lockedAt: true },
  });
  if (due.length === 0) return report;

  // Claim each row. Losing a claim means another worker has it.
  const won: string[] = [];
  for (const row of due) {
    const claim = await prisma.notificationDelivery.updateMany({
      where: { id: row.id, status: row.status, lockedAt: row.lockedAt },
      data: { status: "SENDING", lockedAt: now, attempts: { increment: 1 } },
    });
    if (claim.count === 1) won.push(row.id);
  }
  report.claimed = won.length;
  if (won.length === 0) return report;

  const claimed: Claimed[] = await prisma.notificationDelivery.findMany({
    where: { id: { in: won } },
    select: {
      id: true,
      channel: true,
      attempts: true,
      notification: {
        select: {
          id: true,
          userId: true,
          category: true,
          title: true,
          body: true,
          href: true,
          user: {
            select: {
              email: true,
              status: true,
              name: true,
              profile: { select: { displayName: true, notificationPrefs: true } },
            },
          },
        },
      },
    },
  });

  const userIds = [...new Set(claimed.map((row) => row.notification.userId))];
  const [subscriptions, recentEmails] = await Promise.all([
    claimed.some((row) => row.channel === "WEB_PUSH")
      ? prisma.pushSubscription.findMany({
          where: { userId: { in: userIds } },
          select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
        })
      : Promise.resolve([]),
    claimed.some((row) => row.channel === "EMAIL")
      ? prisma.notificationDelivery.findMany({
          where: {
            channel: "EMAIL",
            status: "SENT",
            sentAt: { gte: new Date(now.getTime() - COLLAPSE_MS) },
            notification: { userId: { in: userIds } },
          },
          select: { notification: { select: { userId: true, href: true } } },
        })
      : Promise.resolve([]),
  ]);

  const subsByUser = new Map<string, PushTarget[]>();
  for (const sub of subscriptions) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push(sub);
    subsByUser.set(sub.userId, list);
  }
  const emailedRecently = new Set(
    recentEmails.map((row) => `${row.notification.userId}\u0000${row.notification.href ?? ""}`),
  );

  for (const row of claimed) {
    let outcome: SendOutcome;
    try {
      outcome = await sendOne(row, transport, subsByUser, emailedRecently);
    } catch (error) {
      outcome = { status: "RETRY", error: error instanceof Error ? error.message.slice(0, 300) : "failed" };
    }

    const next = nextState(outcome, row.attempts, now);
    await prisma.notificationDelivery.update({
      where: { id: row.id },
      data: { ...next, lockedAt: null },
    });
    if (next.status === "SENT" && row.channel === "EMAIL") {
      await prisma.notification
        .update({ where: { id: row.notification.id }, data: { emailSentAt: now } })
        .catch(() => undefined);
    }

    if (next.status === "SENT") report.sent += 1;
    else if (next.status === "PENDING") report.retried += 1;
    else if (next.status === "FAILED") report.failed += 1;
    else report.skipped += 1;
  }

  return report;
}

async function sendOne(
  row: Claimed,
  transport: DeliveryTransport,
  subsByUser: Map<string, PushTarget[]>,
  emailedRecently: Set<string>,
): Promise<SendOutcome> {
  const { notification } = row;
  const { user } = notification;
  if (user.status !== "ACTIVE") return { status: "SKIPPED", error: "member not active" };

  const prefs = parsePrefs(user.profile?.notificationPrefs);
  const channel = row.channel === "EMAIL" ? "email" : "push";
  if (!wants(prefs, channel, notification.category)) {
    return { status: "SKIPPED", error: "turned off since queued" };
  }

  if (row.channel === "EMAIL") {
    const collapseKey = `${notification.userId}\u0000${notification.href ?? ""}`;
    if (notification.href && emailedRecently.has(collapseKey)) {
      return { status: "SKIPPED", error: "collapsed into a recent email" };
    }
    const message = renderNotificationEmail({
      userId: notification.userId,
      category: notification.category,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      recipientName: user.profile?.displayName ?? user.name,
    });
    const outcome = await transport.email({ to: user.email, ...message });
    if (outcome.status === "SENT") emailedRecently.add(collapseKey);
    return outcome;
  }

  if (row.channel === "WEB_PUSH") {
    if (!transport.pushEnabled()) return { status: "SKIPPED", error: "push not configured" };
    const targets = subsByUser.get(notification.userId) ?? [];
    if (targets.length === 0) return { status: "SKIPPED", error: "no subscribed browser" };

    const payload: PushPayload = {
      id: notification.id,
      title: notification.title,
      body: outsideBody(notification.category, notification.body),
      url: safePath(notification.href),
      tag: notification.href ?? notification.id,
    };
    const results = await Promise.all(targets.map((target) => transport.push(target, payload)));

    const gone = targets.filter((_, index) => {
      const result = results[index]!;
      return !result.ok && result.gone;
    });
    if (gone.length) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: gone.map((t) => t.id) } } });
    }
    const delivered = targets.filter((_, index) => results[index]!.ok);
    if (delivered.length) {
      await prisma.pushSubscription
        .updateMany({ where: { id: { in: delivered.map((t) => t.id) } }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
      return { status: "SENT" };
    }
    const failures = results.filter((result): result is Extract<PushOutcome, { ok: false }> => !result.ok);
    const error = failures.map((failure) => failure.error).join(", ").slice(0, 300);
    return failures.some((failure) => failure.transient)
      ? { status: "RETRY", error }
      : { status: "FAILED", error };
  }

  return { status: "SKIPPED", error: "unsupported channel" };
}
