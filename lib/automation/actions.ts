import "server-only";
import { prisma } from "@/lib/db";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { parsePrefs, wants } from "@/lib/notifications/preferences";
import { sendTransactionalEmail } from "@/lib/email/send";
import { syncKitForEntitlementChange } from "@/lib/billing/kit";
import { httpKitClient, kitConfigured } from "@/lib/roadmap/kit-client";
import type { Action } from "@/lib/automation/types";
import type { Facts } from "@/lib/automation/conditions";

/**
 * Doing what a rule says, using the systems that already exist.
 *
 * Nothing here is a new delivery mechanism. Notifications go through the same
 * dispatcher the rest of the app uses, so a member's per-channel preferences,
 * their blocks and the email/push outbox all apply unchanged. Kit tags go
 * through the billing Kit client, so a tag named in a rule is resolved to an
 * id the same way a purchase resolves one.
 *
 * Two rules hold for every action:
 *
 * - **Opt-outs win.** A rule cannot email somebody who turned that kind of
 *   email off. The notification action delegates that decision; the email
 *   action checks it explicitly, because a transactional send would otherwise
 *   bypass it.
 * - **An action reports, it does not throw.** One failing action must not
 *   abandon the others or lose the execution record, so each returns a result
 *   the engine writes down.
 */

export type ActionOutcome = {
  type: Action["type"];
  ok: boolean;
  detail: string;
};

/** `{{fact}}` substitution, so a rule can say the member's own numbers. */
export function fillTemplate(text: string, facts: Facts): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) => {
    const value = facts[key];
    return value === null || value === undefined ? whole : String(value);
  });
}

export type ActionContext = {
  userId: string;
  email: string;
  facts: Facts;
  /** The rule's dedupe key, reused so notifications are idempotent too. */
  dedupeKey: string;
  ruleId: string;
  ruleName: string;
};

export async function runAction(action: Action, context: ActionContext): Promise<ActionOutcome> {
  try {
    switch (action.type) {
      case "notification":
        return await notify(action, context);
      case "email":
        return await email(action, context);
      case "kit_tag":
        return await kitTag(action, context);
      case "kit_field":
        return await kitField(action, context);
      case "space":
        return await space(action, context);
      case "badge":
        return await badge(action, context);
      case "admin_task":
        return await adminTask(action, context);
      case "ai_draft":
        return await aiDraft(action, context);
    }
  } catch (error) {
    return {
      type: action.type,
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 300) : "action failed",
    };
  }
}

async function notify(
  action: Extract<Action, { type: "notification" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  // The dispatcher decides in-app / email / push per the member's settings,
  // and the dedupe key makes a re-run write nothing.
  const result = await dispatchNotifications([
    {
      userId: context.userId,
      category: action.category,
      title: fillTemplate(action.title, context.facts),
      body: fillTemplate(action.body, context.facts),
      href: action.href,
      dedupeKey: `rule:${context.ruleId}:${context.dedupeKey}`,
    },
  ]);
  return {
    type: "notification",
    ok: true,
    detail: result.created > 0 ? "notification sent" : "already sent, or muted everywhere",
  };
}

async function email(
  action: Extract<Action, { type: "email" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  // An automated email is a broadcast, not an account notice, so it is held to
  // the member's "Host announcements" email preference. Without this check a
  // rule could mail somebody who has opted out of exactly this.
  const profile = await prisma.profile.findUnique({
    where: { userId: context.userId },
    select: { notificationPrefs: true },
  });
  if (!wants(parsePrefs(profile?.notificationPrefs), "email", "HOST_ANNOUNCEMENTS")) {
    return { type: "email", ok: true, detail: "skipped: member opted out of these emails" };
  }
  const body = fillTemplate(action.body, context.facts);
  await sendTransactionalEmail({
    to: context.email,
    subject: fillTemplate(action.subject, context.facts),
    html: `<p>${escapeHtml(body).replaceAll("\n", "<br />")}</p>`,
    text: body,
  });
  return { type: "email", ok: true, detail: "email sent" };
}

async function kitTag(
  action: Extract<Action, { type: "kit_tag" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  // Reuses the billing Kit client: same credentials, same name-or-id
  // resolution, same KitSyncLog audit trail. Removing a tag removes that tag
  // only — it never unsubscribes the person.
  const result = await syncKitForEntitlementChange({
    userId: context.userId,
    email: context.email,
    tag: action.tag,
    action: action.mode === "remove" ? "revoke" : "grant",
  });
  return {
    type: "kit_tag",
    ok: result.success,
    detail: result.success ? `tag ${action.mode}: ${action.tag}` : (result.error ?? "Kit failed"),
  };
}

async function kitField(
  action: Extract<Action, { type: "kit_field" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  if (!kitConfigured()) {
    return { type: "kit_field", ok: false, detail: "Kit is not configured" };
  }
  const kit = httpKitClient();
  const subscriber = await kit.findSubscriber(context.email);
  if (!subscriber) {
    return { type: "kit_field", ok: true, detail: "skipped: not a Kit subscriber" };
  }
  if (subscriber.state !== "active") {
    return { type: "kit_field", ok: true, detail: `skipped: Kit subscriber is ${subscriber.state}` };
  }
  const keys = await kit.ensureFields([action.field]);
  const key = keys.get(action.field);
  if (!key) return { type: "kit_field", ok: false, detail: "Kit would not create that field" };
  await kit.updateFields(subscriber.id, { [key]: fillTemplate(action.value, context.facts) });
  return { type: "kit_field", ok: true, detail: `field set: ${action.field}` };
}

async function space(
  action: Extract<Action, { type: "space" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  const target = await prisma.space.findUnique({
    where: { slug: action.spaceSlug },
    select: { id: true, name: true },
  });
  if (!target) return { type: "space", ok: false, detail: `no space "${action.spaceSlug}"` };

  if (action.mode === "remove") {
    await prisma.spaceMembership.deleteMany({ where: { spaceId: target.id, userId: context.userId } });
    return { type: "space", ok: true, detail: `removed from ${target.name}` };
  }
  await prisma.spaceMembership.upsert({
    where: { spaceId_userId: { spaceId: target.id, userId: context.userId } },
    create: { spaceId: target.id, userId: context.userId, role: "MEMBER" },
    update: {},
  });
  return { type: "space", ok: true, detail: `added to ${target.name}` };
}

async function badge(
  action: Extract<Action, { type: "badge" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  const target = await prisma.badge.findUnique({
    where: { slug: action.slug },
    select: { id: true, name: true },
  });
  if (!target) return { type: "badge", ok: false, detail: `no badge "${action.slug}"` };
  // Upsert: awarding a badge somebody already has is not an error.
  await prisma.memberBadge.upsert({
    where: { badgeId_userId: { badgeId: target.id, userId: context.userId } },
    create: { badgeId: target.id, userId: context.userId, reason: `Awarded by "${context.ruleName}"` },
    update: {},
  });
  return { type: "badge", ok: true, detail: `badge: ${target.name}` };
}

async function adminTask(
  action: Extract<Action, { type: "admin_task" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  await prisma.adminTask.create({
    data: {
      title: fillTemplate(action.title, context.facts).slice(0, 200),
      detail: action.detail ? fillTemplate(action.detail, context.facts).slice(0, 1000) : null,
      userId: context.userId,
      ruleId: context.ruleId,
    },
  });
  return { type: "admin_task", ok: true, detail: "task raised" };
}

async function aiDraft(
  action: Extract<Action, { type: "ai_draft" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  const schedule = await prisma.aiPromptSchedule.findUnique({
    where: { id: action.scheduleId },
    select: { id: true },
  });
  if (!schedule) return { type: "ai_draft", ok: false, detail: "no such prompt schedule" };
  await prisma.aiPromptDraft.create({
    data: { scheduleId: schedule.id, body: fillTemplate(action.body, context.facts).slice(0, 5000) },
  });
  // Phase 4D owns approving and publishing these; this only queues one.
  return { type: "ai_draft", ok: true, detail: "draft queued for approval" };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
