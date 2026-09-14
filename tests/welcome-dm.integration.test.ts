import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  cancelWelcomeDm,
  getWelcomeSetting,
  noteFirstLogin,
  resolveWelcomeSender,
  scheduleWelcomeDm,
  sendDueWelcomeMessages,
  updateWelcomeSetting,
  welcomeMessageCounts,
  WELCOME_SETTING_ID,
  WelcomeSettingError,
} from "@/lib/messages/welcome";
import { requestAccountDeletion } from "@/lib/billing/deletion";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("welcome DM", () => {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const created: string[] = [];
  let hostId = "";
  let previousSetting: {
    enabled: boolean;
    body: string;
    delayMinutes: number;
    senderId: string | null;
  } | null = null;

  const MINUTE = 60_000;

  async function makeMember(tag: string) {
    const email = `welcome-${tag}-${stamp}@veganuniversity.test`;
    const user = await prisma.user.create({
      data: {
        email,
        handle: `w${tag}${stamp}`.slice(0, 28),
        status: "ACTIVE",
        profile: { create: { displayName: `Welcome ${tag}` } },
      },
    });
    created.push(user.id);
    return user;
  }

  /** The feature on, with a known delay and body. */
  async function enable(delayMinutes = 10, body = "Hello and welcome.") {
    await updateWelcomeSetting({
      enabled: true,
      body,
      delayMinutes,
      senderId: hostId,
    });
  }

  beforeAll(async () => {
    // Remember whatever the database already had, so the suite puts it back.
    const existing = await prisma.welcomeMessageSetting.findUnique({
      where: { id: WELCOME_SETTING_ID },
    });
    previousSetting = existing
      ? {
          enabled: existing.enabled,
          body: existing.body,
          delayMinutes: existing.delayMinutes,
          senderId: existing.senderId,
        }
      : null;

    const sender = await resolveWelcomeSender(null);
    if (!sender) {
      throw new Error(
        "No active HOST/ADMIN/SUPER_ADMIN in the database to send a welcome DM from.",
      );
    }
    hostId = sender;
  });

  beforeEach(async () => {
    // Every test starts from the same setting, so ordering cannot matter.
    await enable();
  });

  afterAll(async () => {
    for (const userId of created) {
      await prisma.welcomeMessageJob.deleteMany({ where: { userId } });
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.message.deleteMany({ where: { authorId: userId } });
      await prisma.conversationMember.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.profile.deleteMany({ where: { userId } });
      await prisma.userEmail.deleteMany({ where: { userId } });
    }
    // Conversations the welcome DMs opened, plus their messages.
    const orphaned = await prisma.conversation.findMany({
      where: { members: { none: {} } },
      select: { id: true },
    });
    for (const conversation of orphaned) {
      await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: created } } });

    // Put the settings row back the way the database had it.
    if (previousSetting) {
      await updateWelcomeSetting(previousSetting);
    } else {
      await prisma.welcomeMessageSetting.deleteMany({
        where: { id: WELCOME_SETTING_ID },
      });
    }
    await prisma.$disconnect();
  });

  it("resolves a staff account to send from", async () => {
    expect(hostId).toBeTruthy();
    // An explicit choice wins over the automatic one.
    expect(await resolveWelcomeSender(hostId)).toBe(hostId);
    // An unknown id falls back rather than stopping every send.
    expect(await resolveWelcomeSender("does-not-exist")).toBeTruthy();
  });

  it("queues exactly one DM on a first login, and none on later logins", async () => {
    const user = await makeMember("once");

    const first = await noteFirstLogin(user.id, new Date());
    expect(first.firstLogin).toBe(true);
    expect(first.scheduled).toBe(true);

    // Signing in again — new device, cleared cookies, whatever — must not
    // stamp again and must not queue a second DM.
    const second = await noteFirstLogin(user.id, new Date());
    const third = await noteFirstLogin(user.id, new Date());
    expect(second.firstLogin).toBe(false);
    expect(third.firstLogin).toBe(false);

    const jobs = await prisma.welcomeMessageJob.findMany({
      where: { userId: user.id },
    });
    expect(jobs).toHaveLength(1);

    const stamped = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstLoginAt: true },
    });
    expect(stamped.firstLoginAt).toBeInstanceOf(Date);
  });

  it("keeps the first stamp when two sign-ins race", async () => {
    const user = await makeMember("race");
    const results = await Promise.all([
      noteFirstLogin(user.id, new Date()),
      noteFirstLogin(user.id, new Date()),
      noteFirstLogin(user.id, new Date()),
    ]);
    // Exactly one caller may win, whichever it is.
    expect(results.filter((r) => r.firstLogin)).toHaveLength(1);
    expect(
      await prisma.welcomeMessageJob.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it("sends only what is due, and marks it sent exactly once", async () => {
    const due = await makeMember("due");
    const notYet = await makeMember("notyet");

    const now = new Date();
    // One scheduled ten minutes ago, one scheduled now with a ten minute delay.
    await noteFirstLogin(due.id, new Date(now.getTime() - 10 * MINUTE));
    await noteFirstLogin(notYet.id, now);

    const result = await sendDueWelcomeMessages(now);
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const dueJob = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: due.id },
    });
    const pendingJob = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: notYet.id },
    });
    expect(dueJob.sentAt).toBeInstanceOf(Date);
    expect(dueJob.messageId).toBeTruthy();
    expect(pendingJob.sentAt).toBeNull();

    // The message really exists, in a real conversation, from the sender.
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: dueJob.messageId! },
      include: { conversation: { include: { members: true } } },
    });
    expect(message.authorId).toBe(hostId);
    expect(message.conversation.members.map((m) => m.userId).sort()).toEqual(
      [hostId, due.id].sort(),
    );

    // A second sweep must not send again.
    const again = await sendDueWelcomeMessages(now);
    expect(again.sent).toBe(0);
    expect(
      await prisma.message.count({ where: { conversationId: message.conversationId } }),
    ).toBe(1);
  });

  it("sends the live message text, not a copy frozen at scheduling", async () => {
    const user = await makeMember("livetext");
    await enable(10, "Original wording.");
    await noteFirstLogin(user.id, new Date(Date.now() - 20 * MINUTE));

    await enable(10, "Edited wording.");
    await sendDueWelcomeMessages(new Date());

    const job = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: job.messageId! },
    });
    expect(message.body).toBe("Edited wording.");
  });

  it("honours the delay that was active when the send was scheduled", async () => {
    const user = await makeMember("delay");
    const at = new Date();
    await enable(30);
    await noteFirstLogin(user.id, at);

    const queued = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    const scheduledFor = queued.dueAt.getTime();
    expect(scheduledFor - at.getTime()).toBeGreaterThanOrEqual(29 * MINUTE);

    // Lengthening the delay afterwards must not move this send.
    await enable(600);
    const unchanged = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(unchanged.dueAt.getTime()).toBe(scheduledFor);

    // And it still goes out at its original time, not the new one.
    const result = await sendDueWelcomeMessages(
      new Date(at.getTime() + 31 * MINUTE),
    );
    expect(result.sent).toBeGreaterThanOrEqual(1);
  });

  it("cancels a pending send when the account is closed first", async () => {
    const user = await makeMember("deleted");
    await noteFirstLogin(user.id, new Date());

    const outcome = await requestAccountDeletion(user.id, "test");
    expect(outcome.ok).toBe(true);

    const job = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(job.canceledAt).toBeInstanceOf(Date);
    expect(job.cancelReason).toBe("account-deletion-requested");

    // And the sweep will not resurrect it.
    await sendDueWelcomeMessages(new Date(Date.now() + 60 * MINUTE));
    const after = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(after.sentAt).toBeNull();
  });

  it("refuses to send to an account that stopped being active", async () => {
    const user = await makeMember("suspended");
    await noteFirstLogin(user.id, new Date(Date.now() - 20 * MINUTE));
    // Suspended after scheduling, without going through the deletion flow.
    await prisma.user.update({
      where: { id: user.id },
      data: { status: "SUSPENDED" },
    });

    await sendDueWelcomeMessages(new Date());
    const job = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(job.sentAt).toBeNull();
    expect(job.canceledAt).toBeInstanceOf(Date);
    expect(job.cancelReason).toBe("status:SUSPENDED");
  });

  it("queues nothing while the feature is off", async () => {
    const user = await makeMember("off");
    await updateWelcomeSetting({
      enabled: false,
      body: "Hello and welcome.",
      delayMinutes: 10,
      senderId: hostId,
    });

    const outcome = await noteFirstLogin(user.id, new Date());
    expect(outcome.firstLogin).toBe(true);
    expect(outcome.scheduled).toBe(false);
    expect(
      await prisma.welcomeMessageJob.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it("pauses rather than discards when the feature is switched off mid-queue", async () => {
    const user = await makeMember("paused");
    await noteFirstLogin(user.id, new Date(Date.now() - 20 * MINUTE));

    await updateWelcomeSetting({
      enabled: false,
      body: "Hello and welcome.",
      delayMinutes: 10,
      senderId: hostId,
    });
    const off = await sendDueWelcomeMessages(new Date());
    expect(off.skipped).toBe("disabled");

    const stillQueued = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(stillQueued.sentAt).toBeNull();
    expect(stillQueued.canceledAt).toBeNull();

    // Back on, and the member who was waiting is greeted.
    await enable();
    const on = await sendDueWelcomeMessages(new Date());
    expect(on.sent).toBeGreaterThanOrEqual(1);
  });

  it("never schedules twice for the same member, even called directly", async () => {
    const user = await makeMember("direct");
    expect(await scheduleWelcomeDm(user.id, new Date())).toBe(true);
    expect(await scheduleWelcomeDm(user.id, new Date())).toBe(false);
    expect(
      await prisma.welcomeMessageJob.count({ where: { userId: user.id } }),
    ).toBe(1);
  });

  it("counts what the admin panel reports", async () => {
    const counts = await welcomeMessageCounts();
    expect(counts.total).toBeGreaterThanOrEqual(counts.sent);
    expect(counts.total).toBeGreaterThanOrEqual(counts.pending + counts.canceled);
  });

  it("cancelling is idempotent and never un-sends a delivered message", async () => {
    const user = await makeMember("cancelsent");
    await noteFirstLogin(user.id, new Date(Date.now() - 20 * MINUTE));
    await sendDueWelcomeMessages(new Date());

    const canceledCount = await cancelWelcomeDm(user.id, "too-late");
    expect(canceledCount).toBe(0);

    const job = await prisma.welcomeMessageJob.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(job.sentAt).toBeInstanceOf(Date);
    expect(job.canceledAt).toBeNull();
  });

  it("rejects settings that would break a send", async () => {
    await expect(
      updateWelcomeSetting({ enabled: true, body: "   ", delayMinutes: 10 }),
    ).rejects.toBeInstanceOf(WelcomeSettingError);
    await expect(
      updateWelcomeSetting({ enabled: true, body: "hi", delayMinutes: -1 }),
    ).rejects.toBeInstanceOf(WelcomeSettingError);
    await expect(
      updateWelcomeSetting({ enabled: true, body: "hi", delayMinutes: 1.5 }),
    ).rejects.toBeInstanceOf(WelcomeSettingError);
    await expect(
      updateWelcomeSetting({ enabled: true, body: "hi", delayMinutes: 999_999 }),
    ).rejects.toBeInstanceOf(WelcomeSettingError);
  });

  it("reads settings back as saved", async () => {
    await updateWelcomeSetting({
      enabled: true,
      body: "  Trimmed body.  ",
      delayMinutes: 42,
      senderId: hostId,
    });
    const setting = await getWelcomeSetting();
    expect(setting.enabled).toBe(true);
    expect(setting.body).toBe("Trimmed body.");
    expect(setting.delayMinutes).toBe(42);
    expect(setting.senderId).toBe(hostId);
  });
});
