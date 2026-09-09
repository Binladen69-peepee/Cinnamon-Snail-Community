import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { applyEntitlementEffect } from "@/lib/billing/apply";
import { listSamcartSubscriptions } from "@/lib/billing/samcart-api";
import { isPayingStatus } from "@/lib/billing/types";
import { sendTransactionalEmail } from "@/lib/email/send";
import { reconciliationEmailHtml } from "@/lib/email/templates/billing";
import { isEntitlementActive } from "@/lib/entitlements/check";

export type FindingDraft = {
  kind: "paying_no_access" | "access_not_paying" | "orphaned_subscription" | "duplicate_subscription";
  severity: "auto_fix" | "alert";
  userId?: string | null;
  subscriptionId?: string | null;
  detail: Record<string, unknown>;
};

export function detectLocalDrift(input: {
  subscriptions: {
    id: string;
    userId: string;
    productId: string;
    status: Parameters<typeof isPayingStatus>[0];
    samcartSubscriptionId: string | null;
  }[];
  entitlements: {
    id: string;
    userId: string;
    productId: string;
    subscriptionId: string | null;
    source: string;
    status: "ACTIVE" | "EXPIRED" | "REVOKED";
    startsAt: Date;
    endsAt: Date | null;
    revokedAt: Date | null;
  }[];
  now?: Date;
}): FindingDraft[] {
  const now = input.now ?? new Date();
  const findings: FindingDraft[] = [];
  const paying = input.subscriptions.filter((item) => isPayingStatus(item.status));

  for (const subscription of paying) {
    const matching = input.entitlements.filter(
      (item) =>
        item.userId === subscription.userId &&
        item.productId === subscription.productId &&
        isEntitlementActive(item, now),
    );
    if (matching.length === 0) {
      findings.push({
        kind: "paying_no_access",
        severity: "auto_fix",
        userId: subscription.userId,
        subscriptionId: subscription.id,
        detail: { productId: subscription.productId },
      });
    }
  }

  for (const entitlement of input.entitlements) {
    if (!isEntitlementActive(entitlement, now)) continue;
    if (entitlement.source === "MANUAL" || entitlement.source === "MIGRATION") continue;
    const payingMatch = paying.find(
      (item) =>
        item.userId === entitlement.userId &&
        item.productId === entitlement.productId &&
        (!entitlement.subscriptionId || item.id === entitlement.subscriptionId),
    );
    if (!payingMatch) {
      findings.push({
        kind: "access_not_paying",
        severity: "alert",
        userId: entitlement.userId,
        subscriptionId: entitlement.subscriptionId,
        detail: { entitlementId: entitlement.id, productId: entitlement.productId },
      });
    }
  }

  const orphans = input.subscriptions.filter(
    (item) => item.samcartSubscriptionId && !item.userId,
  );
  for (const subscription of orphans) {
    findings.push({
      kind: "orphaned_subscription",
      severity: "alert",
      subscriptionId: subscription.id,
      detail: { samcartSubscriptionId: subscription.samcartSubscriptionId },
    });
  }

  const groups = new Map<string, string[]>();
  for (const subscription of paying) {
    const key = `${subscription.userId}:${subscription.productId}`;
    groups.set(key, [...(groups.get(key) ?? []), subscription.id]);
  }
  for (const [key, ids] of groups) {
    if (ids.length > 1) {
      findings.push({
        kind: "duplicate_subscription",
        severity: "alert",
        userId: key.split(":")[0],
        detail: { subscriptionIds: ids },
      });
    }
  }

  return findings;
}

export async function runNightlyReconciliation() {
  const run = await prisma.reconciliationRun.create({
    data: { status: "running" },
  });

  try {
    const [subscriptions, entitlements, pending] = await Promise.all([
      prisma.subscription.findMany(),
      prisma.entitlement.findMany(),
      prisma.pendingGrant.findMany({ where: { claimedAt: null } }),
    ]);

    const findings = detectLocalDrift({ subscriptions, entitlements });

    for (const grant of pending) {
      findings.push({
        kind: "paying_no_access",
        severity: "alert",
        detail: {
          email: grant.email,
          productId: grant.productId,
          pendingGrantId: grant.id,
          note: "Purchase matched no signed-in user yet",
        },
      });
    }

    const remote = await listSamcartSubscriptions();
    if (!remote.ok) {
      findings.push({
        kind: "orphaned_subscription",
        severity: "alert",
        detail: { note: "Could not compare SamCart subscriptions", error: remote.error },
      });
    } else {
      const localIds = new Set(
        subscriptions.map((item) => item.samcartSubscriptionId).filter(Boolean),
      );
      for (const remoteSub of remote.subscriptions) {
        if (!localIds.has(remoteSub.id) && isRemotePaying(remoteSub.status)) {
          findings.push({
            kind: "orphaned_subscription",
            severity: "alert",
            detail: {
              samcartSubscriptionId: remoteSub.id,
              email: remoteSub.customerEmail,
              note: "Present in SamCart, missing locally",
            },
          });
        }
      }
    }

    let autoFixed = 0;
    for (const finding of findings) {
      let fixed = false;
      if (finding.kind === "paying_no_access" && finding.subscriptionId && finding.userId) {
        const subscription = subscriptions.find((item) => item.id === finding.subscriptionId);
        if (subscription) {
          await applyEntitlementEffect({
            userId: subscription.userId,
            productId: subscription.productId,
            subscriptionId: subscription.id,
            source: "SUBSCRIPTION",
            effect: { kind: "grant" },
          });
          fixed = true;
          autoFixed += 1;
        }
      }
      await prisma.reconciliationFinding.create({
        data: {
          runId: run.id,
          kind: finding.kind,
          severity: finding.severity,
          userId: finding.userId ?? null,
          subscriptionId: finding.subscriptionId ?? null,
          detail: finding.detail as Prisma.InputJsonValue,
          autoFixed: fixed,
        },
      });
    }

    const alerts = findings.filter((item) => item.severity === "alert").length;
    const status = findings.length === 0 ? "clean" : "drift";
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status,
        summary: {
          findings: findings.length,
          autoFixed,
          alerts,
          samcartCompared: remote.ok,
        },
      },
    });

    await sendReconciliationEmail(run.id, status, autoFixed, alerts, findings.length === 0);
    await writeAuditLog({
      action: "billing.reconciliation",
      targetType: "reconciliation_run",
      targetId: run.id,
      metadata: { status, autoFixed, alerts },
    });
    return { runId: run.id, status, autoFixed, alerts };
  } catch (error) {
    await prisma.reconciliationRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "failed",
        summary: { error: error instanceof Error ? error.message : "failed" },
      },
    });
    throw error;
  }
}

function isRemotePaying(status: string) {
  return ["active", "past_due", "canceling", "comped", "trialing"].includes(status.toLowerCase());
}

async function sendReconciliationEmail(
  runId: string,
  status: string,
  autoFixed: number,
  alerts: number,
  clean: boolean,
) {
  const to = process.env.BILLING_ALERT_EMAIL ?? process.env.EMAIL_FROM;
  if (!to) return;
  const address = to.includes("<") ? (to.match(/<([^>]+)>/)?.[1] ?? to) : to;
  await sendTransactionalEmail({
    to: address,
    subject: clean
      ? "Vegan University billing reconciliation is clean"
      : "Vegan University billing reconciliation found drift",
    html: reconciliationEmailHtml({ status, autoFixed, alerts, clean }),
  });
  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: { emailSentAt: new Date() },
  });
}
