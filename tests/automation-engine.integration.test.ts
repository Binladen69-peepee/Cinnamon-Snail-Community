import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  retryExecution,
  runAutomations,
  setAutomationPaused,
} from "@/lib/automation/engine";
import { seedAutomationRules, INITIAL_RULES } from "@/lib/automation/initial-rules";
import { getTransactionalInbox } from "@/lib/email/send";

/**
 * The automation engine against the database.
 *
 * These are the properties that only exist once there are rows: that a rule
 * acts once and not twice, that a member who lapses again is a new case, that
 * a preview changes nothing, that the kill switch holds, and that an opt-out
 * is honoured. Needs the local Docker Postgres; skips rather than fails.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
const quietId: string[] = [];
const ruleIds: string[] = [];

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function makeMember(suffix: string, quietDays: number) {
  const user = await prisma.user.create({
    data: {
      email: `auto-${stamp}-${suffix}@example.test`,
      handle: `auto${stamp}${suffix}`,
      name: `Auto ${suffix}`,
      status: "ACTIVE",
      createdAt: ago(quietDays + 60),
      lastLoginAt: ago(quietDays),
      profile: { create: { displayName: `Auto ${suffix}` } },
    },
    select: { id: true },
  });
  quietId.push(user.id);
  return user.id;
}

async function makeRule(input: {
  suffix: string;
  trigger: string;
  params?: Record<string, unknown>;
  conditions?: unknown[];
  actions: unknown[];
  enabled?: boolean;
  /** Defaults to this test's own member; pass a different suffix to widen. */
  scopeTo?: string;
}) {
  const scope = {
    fact: "email",
    op: "contains",
    value: `auto-${stamp}-${input.scopeTo ?? `${input.suffix}@`}`,
  };
  const rule = await prisma.automationRule.create({
    data: {
      slug: `it-auto-${stamp}-${input.suffix}`,
      name: `Test ${input.suffix}`,
      trigger: input.trigger,
      conditions: {
        params: (input.params ?? {}) as Prisma.InputJsonObject,
        list: [scope, ...(input.conditions ?? [])] as unknown as Prisma.InputJsonArray,
      },
      actions: input.actions as unknown as Prisma.InputJsonArray,
      enabled: input.enabled ?? true,
    },
    select: { id: true, slug: true },
  });
  ruleIds.push(rule.id);
  return rule;
}

const notifyAction = {
  type: "notification",
  category: "HOST_ANNOUNCEMENTS",
  title: "Quiet for {{daysQuiet}} days",
  body: "Come back",
  href: "/home",
};

beforeAll(async () => {
  try {
    await prisma.automationRule.count();
  } catch {
    reachable = false;
  }
});

beforeEach(async () => {
  if (!reachable) return;
  await prisma.ruleExecution.deleteMany({ where: { ruleId: { in: ruleIds } } });
  await setAutomationPaused(false, "test");
});

afterAll(async () => {
  if (reachable) {
    await prisma.ruleExecution.deleteMany({ where: { ruleId: { in: ruleIds } } });
    await prisma.automationRule.deleteMany({ where: { slug: { startsWith: `it-auto-${stamp}` } } });
    await prisma.adminTask.deleteMany({ where: { userId: { in: quietId } } });
    await prisma.notification.deleteMany({ where: { userId: { in: quietId } } });
    await prisma.user.deleteMany({ where: { id: { in: quietId } } });
    await setAutomationPaused(false, "test");
  }
  await prisma.$disconnect();
});

describe("acting once", () => {
  it("acts on a quiet member, and does nothing at all on a second run", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("quiet", 20);
    const rule = await makeRule({ suffix: "quiet", trigger: "inactivity", params: { days: 14 }, actions: [notifyAction] });

    const first = await runAutomations({ slugs: [rule.slug] });
    const mine = first.rules[0]!;
    expect(mine.fired).toBe(1);

    const notifications = await prisma.notification.count({ where: { userId } });
    expect(notifications).toBe(1);

    const second = await runAutomations({ slugs: [rule.slug] });
    expect(second.rules[0]!.fired).toBe(0);
    expect(second.rules[0]!.skipped).toBe(1);
    expect(await prisma.notification.count({ where: { userId } })).toBe(1);
  });

  it("fires again when the member lapses a second time", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("lapse", 20);
    const rule = await makeRule({ suffix: "lapse", trigger: "inactivity", params: { days: 14 }, actions: [notifyAction] });
    await runAutomations({ slugs: [rule.slug] });
    expect(await prisma.notification.count({ where: { userId } })).toBe(1);

    // They come back, then go quiet again: a different last-activity day, so a
    // different dedupe key, so this is a new case rather than a repeat.
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: ago(15) } });
    await runAutomations({ slugs: [rule.slug] });
    expect(await prisma.notification.count({ where: { userId } })).toBe(2);
  });

  it("lets only one of two concurrent runs act", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("race", 20);
    const rule = await makeRule({ suffix: "race", trigger: "inactivity", params: { days: 14 }, actions: [notifyAction] });
    const [a, b] = await Promise.all([
      runAutomations({ slugs: [rule.slug] }),
      runAutomations({ slugs: [rule.slug] }),
    ]);
    expect(a.rules[0]!.fired + b.rules[0]!.fired).toBe(1);
    expect(await prisma.notification.count({ where: { userId } })).toBe(1);
  });
});

describe("controls", () => {
  it("a dry run previews who would be affected and consumes nothing", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("dry", 20);
    const rule = await makeRule({ suffix: "dry", trigger: "inactivity", params: { days: 14 }, actions: [notifyAction] });

    const preview = await runAutomations({ slugs: [rule.slug], dryRun: true });
    const report = preview.rules[0]!;
    expect(report.matched).toBe(1);
    expect(report.preview?.some((row) => row.userId === userId && row.wouldFire)).toBe(true);
    expect(await prisma.ruleExecution.count({ where: { ruleId: rule.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);

    // The real run afterwards still fires: the preview did not spend it.
    const real = await runAutomations({ slugs: [rule.slug] });
    expect(real.rules[0]!.fired).toBe(1);

    // Previewing again now shows them as already handled.
    const after = await runAutomations({ slugs: [rule.slug], dryRun: true });
    expect(after.rules[0]!.preview?.find((row) => row.userId === userId)?.wouldFire).toBe(false);
  });

  it("pausing stops real runs but still allows a preview", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("pause", 20);
    const rule = await makeRule({ suffix: "pause", trigger: "inactivity", params: { days: 14 }, actions: [notifyAction] });

    await setAutomationPaused(true, "test");
    const held = await runAutomations({ slugs: [rule.slug] });
    expect(held.paused).toBe(true);
    expect(held.rules).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);

    const preview = await runAutomations({ slugs: [rule.slug], dryRun: true });
    expect(preview.paused).toBe(false);
    expect(preview.rules[0]!.matched).toBe(1);

    await setAutomationPaused(false, "test");
    expect((await runAutomations({ slugs: [rule.slug] })).rules[0]!.fired).toBe(1);
  });

  it("a disabled rule does not run", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("off", 20);
    const rule = await makeRule({
      suffix: "off", trigger: "inactivity", params: { days: 14 }, actions: [notifyAction], enabled: false,
    });
    const result = await runAutomations({ slugs: [rule.slug] });
    expect(result.rules).toHaveLength(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);
  });

  it("reports a broken rule instead of running part of it", async ({ skip }) => {
    if (!reachable) skip();
    await makeMember("broken", 20);
    const rule = await makeRule({
      suffix: "broken",
      trigger: "inactivity",
      params: { days: 14 },
      // The second action is malformed: no subject.
      actions: [notifyAction, { type: "email", body: "hi" }],
    });
    const result = await runAutomations({ slugs: [rule.slug] });
    expect(result.rules[0]!.error).toBeTruthy();
    expect(result.rules[0]!.fired).toBe(0);
    expect(await prisma.ruleExecution.count({ where: { ruleId: rule.id } })).toBe(0);
  });

  it("retries a failed execution without spending a second key", async ({ skip }) => {
    if (!reachable) skip();
    const userId = await makeMember("retry", 20);
    // A space that does not exist makes the action fail, so the execution is
    // recorded unsuccessful and is a retry candidate.
    const rule = await makeRule({
      suffix: "retry",
      trigger: "inactivity",
      params: { days: 14 },
      actions: [{ type: "space", spaceSlug: `nope-${stamp}`, mode: "add" }],
    });
    const run = await runAutomations({ slugs: [rule.slug] });
    expect(run.rules[0]!.failed).toBe(1);

    const execution = await prisma.ruleExecution.findFirstOrThrow({ where: { ruleId: rule.id, userId } });
    expect(execution.success).toBe(false);

    const retried = await retryExecution(execution.id, "test-admin");
    expect(retried?.failed).toBe(1); // still no such space
    // Still exactly one execution row: a retry reuses it rather than claiming anew.
    expect(await prisma.ruleExecution.count({ where: { ruleId: rule.id } })).toBe(1);
  });
});

describe("respecting the member", () => {
  it("does not email somebody who turned these emails off", async ({ skip }) => {
    if (!reachable) skip();
    const optedOut = await makeMember("optout", 20);
    await prisma.profile.update({
      where: { userId: optedOut },
      data: { notificationPrefs: { email: { HOST_ANNOUNCEMENTS: false } } },
    });
    const rule = await makeRule({
      suffix: "optout",
      trigger: "inactivity",
      params: { days: 14 },
      actions: [{ type: "email", subject: "Come back", body: "We miss you" }],
    });

    const before = getTransactionalInbox().length;
    const result = await runAutomations({ slugs: [rule.slug] });
    expect(result.rules[0]!.fired).toBe(1);

    const sentToThem = getTransactionalInbox()
      .slice(before)
      .filter((mail) => mail.to.includes(`auto-${stamp}-optout`));
    expect(sentToThem).toHaveLength(0);

    const execution = await prisma.ruleExecution.findFirstOrThrow({ where: { ruleId: rule.id } });
    expect(JSON.stringify(execution.output)).toContain("opted out");
  });

  it("conditions narrow the audience the trigger found", async ({ skip }) => {
    if (!reachable) skip();
    const barely = await makeMember("barely", 15);
    const longGone = await makeMember("longgone", 90);
    const rule = await makeRule({
      suffix: "cond",
      trigger: "inactivity",
      params: { days: 14 },
      // Both members are in scope; only the threshold separates them.
      scopeTo: "",
      conditions: [{ fact: "daysQuiet", op: "gte", value: 60 }],
      actions: [notifyAction],
    });
    await runAutomations({ slugs: [rule.slug] });
    expect(await prisma.notification.count({ where: { userId: longGone } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: barely } })).toBe(0);
  });
});

describe("seeding", () => {
  it("adds the shipped rules once, disabled, and never twice", async ({ skip }) => {
    if (!reachable) skip();
    const first = await seedAutomationRules();
    const second = await seedAutomationRules();
    expect(second.created).toBe(0);

    const shipped = await prisma.automationRule.findMany({
      where: { slug: { in: INITIAL_RULES.map((rule) => rule.slug) } },
      select: { slug: true, enabled: true },
    });
    expect(shipped).toHaveLength(INITIAL_RULES.length);
    expect(shipped.every((rule) => rule.enabled === false)).toBe(true);
    expect(first.created + first.existing).toBeGreaterThanOrEqual(INITIAL_RULES.length);
  });
});
