import "server-only";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import { conversationMemberKey } from "@/lib/messages/permissions";

/**
 * The welcome DM: a direct message that lands a set number of minutes after a
 * member signs in for the very first time.
 *
 * ## Why a table and not environment variables
 *
 * Every other operational setting in this codebase is an environment variable
 * read through a `config.ts` (see `lib/billing/config.ts`). This one is not,
 * because the requirement is that an admin edits it — the wording is copy Adam
 * wants to change without a deploy, and a delay he wants to tune. So it is a
 * single settings row, with the defaults below standing in until it is saved
 * for the first time.
 *
 * ## Why it cannot double-send
 *
 * Not because the code checks first — two concurrent sign-ins would both pass
 * that check. `WelcomeMessageJob.userId` is unique, so scheduling is an insert
 * that the database rejects the second time. The same applies at send time: the
 * sweep claims a job with a guarded update inside a transaction, so a second
 * cron run overlapping the first finds nothing left to claim.
 *
 * ## What is captured and what is read live
 *
 * The *delay* is captured: it becomes an absolute `dueAt` the moment the job is
 * created, so an admin lengthening the delay does not push back sends already
 * waiting. The *text* is not captured: the sweep reads the current body when it
 * sends, so fixing a typo fixes it for everyone still queued. Those are
 * deliberately opposite, and they are what the brief asked for.
 */

/** Used until an admin saves the settings row for the first time. */
export const WELCOME_DEFAULTS = {
  enabled: false,
  delayMinutes: 10,
  body:
    "Welcome to Vegan University! I'm really glad you're here.\n\n" +
    "Have a look around the Kitchen Table — that's where everyone posts what " +
    "they cooked, asks questions, and swaps substitutions. Tell us what you're " +
    "hoping to learn and someone will point you at the right class.\n\n" +
    "If you get stuck on anything, just reply to this message.",
} as const;

export const WELCOME_SETTING_ID = "default";

/** Hard bounds on the delay, so a typo cannot queue a DM for next year. */
export const MIN_DELAY_MINUTES = 0;
export const MAX_DELAY_MINUTES = 60 * 24 * 14;

export const MAX_BODY_LENGTH = 4000;

export type WelcomeSetting = {
  enabled: boolean;
  body: string;
  delayMinutes: number;
  senderId: string | null;
  updatedAt: Date | null;
};

/**
 * The current settings, falling back to the defaults when no row exists.
 *
 * Never throws on a missing row: a fresh database should render the admin
 * panel, not an error.
 */
export async function getWelcomeSetting(): Promise<WelcomeSetting> {
  const row = await prisma.welcomeMessageSetting.findUnique({
    where: { id: WELCOME_SETTING_ID },
  });
  if (!row) {
    return {
      enabled: WELCOME_DEFAULTS.enabled,
      body: WELCOME_DEFAULTS.body,
      delayMinutes: WELCOME_DEFAULTS.delayMinutes,
      senderId: null,
      updatedAt: null,
    };
  }
  return {
    enabled: row.enabled,
    body: row.body,
    delayMinutes: row.delayMinutes,
    senderId: row.senderId,
    updatedAt: row.updatedAt,
  };
}

export class WelcomeSettingError extends Error {}

/** Validates and saves the admin form. */
export async function updateWelcomeSetting(input: {
  enabled: boolean;
  body: string;
  delayMinutes: number;
  senderId?: string | null;
  updatedById?: string | null;
}) {
  const body = input.body.trim();
  if (!body) {
    throw new WelcomeSettingError("Write the message members will receive.");
  }
  if (body.length > MAX_BODY_LENGTH) {
    throw new WelcomeSettingError(
      `Keep the message under ${MAX_BODY_LENGTH} characters.`,
    );
  }
  if (
    !Number.isInteger(input.delayMinutes) ||
    input.delayMinutes < MIN_DELAY_MINUTES ||
    input.delayMinutes > MAX_DELAY_MINUTES
  ) {
    throw new WelcomeSettingError(
      `The delay must be a whole number of minutes between ${MIN_DELAY_MINUTES} and ${MAX_DELAY_MINUTES}.`,
    );
  }

  const data = {
    enabled: input.enabled,
    body,
    delayMinutes: input.delayMinutes,
    senderId: input.senderId ?? null,
    updatedById: input.updatedById ?? null,
  };
  return prisma.welcomeMessageSetting.upsert({
    where: { id: WELCOME_SETTING_ID },
    update: data,
    create: { id: WELCOME_SETTING_ID, ...data },
  });
}

/**
 * Who the DM comes from.
 *
 * An explicit choice wins. Otherwise the most senior staff account, which
 * keeps the feature working on a fresh install without anyone configuring it.
 * Returns null when the community has no staff at all, which the sweep treats
 * as a failure worth reporting rather than a reason to send from nobody.
 */
export async function resolveWelcomeSender(
  explicitId: string | null,
): Promise<string | null> {
  if (explicitId) {
    const chosen = await prisma.user.findFirst({
      where: { id: explicitId, status: "ACTIVE" },
      select: { id: true },
    });
    if (chosen) return chosen.id;
    // Falls through deliberately: a sender who has since been suspended should
    // not silently stop every welcome DM.
  }
  for (const role of ["SUPER_ADMIN", "ADMIN", "HOST"] as const) {
    const staff = await prisma.user.findFirst({
      where: { status: "ACTIVE", roles: { some: { role: { name: role } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (staff) return staff.id;
  }
  return null;
}

/**
 * Records a member's first-ever sign-in and queues their welcome DM.
 *
 * The stamp is written with a guarded `updateMany` rather than a read followed
 * by a write: `firstLoginAt: null` in the filter means the database decides who
 * is first, so two sign-ins racing on two devices produce exactly one winner.
 * Everything else keys off that single `count === 1`.
 *
 * Returns what happened, which is mostly for tests and the audit trail.
 */
export async function noteFirstLogin(userId: string, now = new Date()) {
  const claimed = await prisma.user.updateMany({
    where: { id: userId, firstLoginAt: null },
    data: { firstLoginAt: now },
  });
  if (claimed.count === 0) return { firstLogin: false as const, scheduled: false };

  const scheduled = await scheduleWelcomeDm(userId, now);
  return { firstLogin: true as const, scheduled };
}

/**
 * Queues the DM, if the feature is on.
 *
 * The insert is allowed to fail on the unique constraint and is not retried:
 * a row already existing means this member has been scheduled before, which is
 * exactly the outcome we want.
 */
export async function scheduleWelcomeDm(
  userId: string,
  now = new Date(),
): Promise<boolean> {
  const setting = await getWelcomeSetting();
  if (!setting.enabled) return false;

  const dueAt = new Date(now.getTime() + setting.delayMinutes * 60_000);
  try {
    await prisma.welcomeMessageJob.create({ data: { userId, dueAt } });
    return true;
  } catch {
    // Unique violation: already queued, already sent, or already cancelled.
    return false;
  }
}

/**
 * Stops a queued DM. Used when an account is closed before it lands.
 *
 * Only touches jobs that have not gone out — a message already delivered
 * cannot be unsent, and marking it cancelled would misreport the counts.
 */
export async function cancelWelcomeDm(userId: string, reason: string) {
  const result = await prisma.welcomeMessageJob.updateMany({
    where: { userId, sentAt: null, canceledAt: null },
    data: { canceledAt: new Date(), cancelReason: reason },
  });
  return result.count;
}

/** Statuses that should never receive a welcome DM. */
function isSendable(status: string) {
  return status === "ACTIVE";
}

export type WelcomeSweepResult = {
  sent: number;
  canceled: number;
  failed: number;
  /** Set when the sweep deliberately did nothing. */
  skipped?: "disabled" | "no-sender";
};

/**
 * The cron sweep: send everything that is due.
 *
 * Per DEC-011 there is no Inngest yet, so this is a plain function invoked by
 * `POST /api/jobs/welcome`. It is safe to run concurrently and safe to run
 * often; it does nothing when nothing is due.
 */
export async function sendDueWelcomeMessages(
  now = new Date(),
  limit = 100,
): Promise<WelcomeSweepResult> {
  const setting = await getWelcomeSetting();
  // Turning the feature off pauses the queue rather than discarding it, so
  // switching it back on resumes the members who were already waiting.
  if (!setting.enabled) return { sent: 0, canceled: 0, failed: 0, skipped: "disabled" };

  const due = await prisma.welcomeMessageJob.findMany({
    where: { sentAt: null, canceledAt: null, dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      user: { select: { status: true } },
    },
  });
  if (due.length === 0) return { sent: 0, canceled: 0, failed: 0 };

  const senderId = await resolveWelcomeSender(setting.senderId);
  if (!senderId) {
    return { sent: 0, canceled: 0, failed: 0, skipped: "no-sender" };
  }

  let sent = 0;
  let canceled = 0;
  let failed = 0;

  for (const job of due) {
    // Closed, suspended or mid-deletion between scheduling and now.
    if (!isSendable(job.user.status)) {
      await prisma.welcomeMessageJob.updateMany({
        where: { id: job.id, sentAt: null, canceledAt: null },
        data: { canceledAt: now, cancelReason: `status:${job.user.status}` },
      });
      canceled += 1;
      continue;
    }
    // An admin's own first sign-in would otherwise queue a DM to themselves.
    if (job.userId === senderId) {
      await prisma.welcomeMessageJob.updateMany({
        where: { id: job.id, sentAt: null, canceledAt: null },
        data: { canceledAt: now, cancelReason: "sender-is-recipient" },
      });
      canceled += 1;
      continue;
    }

    try {
      const delivered = await deliverWelcomeDm({
        jobId: job.id,
        senderId,
        recipientId: job.userId,
        body: setting.body,
        now,
      });
      if (delivered) sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      await prisma.welcomeMessageJob
        .update({
          where: { id: job.id },
          data: { failedAt: now, lastError: message.slice(0, 500) },
        })
        .catch(() => undefined);
      console.error(`[welcome-dm] send failed for job ${job.id}: ${message}`);
    }
  }

  return { sent, canceled, failed };
}

/**
 * Writes the conversation, the message and the notification, then marks the
 * job sent — all in one transaction.
 *
 * The claim at the top is the concurrency guard. `updateMany` filtered on
 * `sentAt: null` takes a row lock for the rest of the transaction, so a second
 * sweep running at the same time blocks here, then re-reads the row, sees it
 * claimed, and returns 0 rather than sending a second copy.
 *
 * This deliberately does NOT go through `sendMessage`. That path enforces the
 * member-to-member gate — DM preferences, shared spaces, whether you have
 * spoken before — and a brand-new member who has set "messages from people I
 * follow" would reject the one message meant to greet them. This is a
 * transactional message from the community itself, so it is written directly.
 * A block cannot apply: the account is minutes old.
 */
async function deliverWelcomeDm(input: {
  jobId: string;
  senderId: string;
  recipientId: string;
  body: string;
  now: Date;
}): Promise<boolean> {
  const memberKey = conversationMemberKey([input.senderId, input.recipientId]);

  const messageId = await prisma.$transaction(async (tx) => {
    const claim = await tx.welcomeMessageJob.updateMany({
      where: { id: input.jobId, sentAt: null, canceledAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0) return null;

    // Reuses the thread if one somehow already exists, so the welcome lands in
    // the same conversation rather than opening a second one beside it.
    const existing = await tx.conversation.findUnique({ where: { memberKey } });
    const conversation =
      existing ??
      (await tx.conversation.create({
        data: {
          isGroup: false,
          memberKey,
          members: {
            create: [{ userId: input.senderId }, { userId: input.recipientId }],
          },
        },
      }));

    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        authorId: input.senderId,
        body: input.body,
      },
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt },
    });

    await tx.welcomeMessageJob.update({
      where: { id: input.jobId },
      data: { sentAt: input.now, messageId: message.id, failedAt: null, lastError: null },
    });

    return message.id;
  });

  if (!messageId) return false;

  // Outside the transaction: a muted notification category must not roll back
  // a message that has already been delivered.
  await createNotification({
    userId: input.recipientId,
    category: "DMS",
    title: "Welcome to Vegan University",
    body: input.body.slice(0, 140),
    href: "/messages",
  }).catch(() => undefined);

  return true;
}

/** Counts for the admin panel. */
export async function welcomeMessageCounts() {
  const [sent, pending, canceled, failed, total] = await Promise.all([
    prisma.welcomeMessageJob.count({ where: { sentAt: { not: null } } }),
    prisma.welcomeMessageJob.count({
      where: { sentAt: null, canceledAt: null },
    }),
    prisma.welcomeMessageJob.count({ where: { canceledAt: { not: null } } }),
    prisma.welcomeMessageJob.count({
      where: { sentAt: null, canceledAt: null, failedAt: { not: null } },
    }),
    prisma.welcomeMessageJob.count(),
  ]);
  return { sent, pending, canceled, failed, total };
}

/** The next few queued sends, for the admin panel. */
export async function upcomingWelcomeMessages(limit = 8) {
  return prisma.welcomeMessageJob.findMany({
    where: { sentAt: null, canceledAt: null },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: {
      id: true,
      dueAt: true,
      failedAt: true,
      lastError: true,
      user: {
        select: { handle: true, profile: { select: { displayName: true } } },
      },
    },
  });
}
