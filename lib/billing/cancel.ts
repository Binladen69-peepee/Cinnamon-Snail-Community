import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { applyCanonicalEvent } from "@/lib/billing/apply";
import {
  cancelSamcartSubscription,
  scheduleSamcartCancellation,
} from "@/lib/billing/samcart-api";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  cancellationConfirmedHtml,
  cancellationFailedHtml,
} from "@/lib/email/templates/billing";

export async function startCancellation(userId: string, subscriptionId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
    include: { product: true },
  });
  if (!subscription) throw new Error("That membership was not found.");
  if (!["ACTIVE", "PAST_DUE", "CANCELING", "COMPED"].includes(subscription.status)) {
    throw new Error("This membership is not active.");
  }
  const request = await prisma.cancellationRequest.create({
    data: {
      userId,
      subscriptionId,
      status: "requested",
    },
  });
  await writeAuditLog({
    actorId: userId,
    action: "billing.cancel.requested",
    targetType: "subscription",
    targetId: subscriptionId,
  });
  return { request, subscription };
}

export async function markSaveShown(requestId: string, userId: string) {
  const request = await prisma.cancellationRequest.findFirst({
    where: { id: requestId, userId },
  });
  if (!request) throw new Error("Cancellation request not found.");
  return prisma.cancellationRequest.update({
    where: { id: requestId },
    data: { status: "save_shown", saveShownAt: new Date() },
  });
}

/**
 * Cancels a membership with SamCart, then records what SamCart confirmed.
 *
 * A member's own cancellation stops the renewal and nothing else: SamCart
 * cancels at the end of the billing period, and the member keeps everything
 * they have paid for until then (`when: "period_end"`, the default). Their
 * entitlement carries that end date, so access stops at that moment on its
 * own; the nightly expiry sweep (`expireEndedAccess`) then closes the
 * subscription and removes the Kit membership tag. Closing the account cancels
 * outright instead (`when: "now"`).
 */
export async function confirmCancellation(input: {
  requestId: string;
  userId: string;
  reason: string;
  when?: "period_end" | "now";
}) {
  const request = await prisma.cancellationRequest.findFirst({
    where: { id: input.requestId, userId: input.userId },
    include: {
      subscription: { include: { product: true, user: { include: { profile: true } } } },
    },
  });
  if (!request) throw new Error("Cancellation request not found.");

  await prisma.cancellationRequest.update({
    where: { id: request.id },
    data: {
      status: "submitted",
      reason: input.reason,
      confirmedAt: new Date(),
      submittedAt: new Date(),
    },
  });

  const samcartId = request.subscription.samcartSubscriptionId;
  if (!samcartId) {
    await failRequest(request.id, "This membership has no SamCart subscription id, so we cannot cancel it.");
    await notifyFailure(request.subscription.user.email, request.subscription.user.profile?.displayName, request.subscription.product.name);
    return { ok: false as const, error: "Missing SamCart subscription id" };
  }

  const result =
    input.when === "now"
      ? await cancelNow(samcartId)
      : await scheduleSamcartCancellation(samcartId);
  if (!result.ok) {
    await failRequest(request.id, result.error);
    await afterSamcart("failure email", request.id, () =>
      notifyFailure(
        request.subscription.user.email,
        request.subscription.user.profile?.displayName,
        request.subscription.product.name,
      ),
    );
    await afterSamcart("failure audit", request.id, () =>
      writeAuditLog({
        actorId: input.userId,
        action: "billing.cancel.failed",
        targetType: "subscription",
        targetId: request.subscriptionId,
        metadata: { error: result.error },
      }),
    );
    return { ok: false as const, error: result.error };
  }

  // SamCart has cancelled. Nothing below may turn that into an error page
  // telling the member it did not happen. If the local write fails, SamCart's
  // own webhook applies the same change.
  const scheduled = result.outcome === "scheduled";
  const stored = request.subscription.periodEnd;
  // A stored period end in the past is a stale one, from an earlier period;
  // ending a scheduled cancellation on it would cut off a period already paid.
  const periodEnd =
    result.periodEnd ?? (scheduled ? (stored && stored > new Date() ? stored : null) : stored);
  await afterSamcart("local state", request.id, () =>
    applyCanonicalEvent({
      type: scheduled ? "cancel_scheduled" : "canceled",
      rawType: scheduled ? "member_cancel_scheduled" : "member_cancel_confirmed",
      providerEventId: `cancel:${request.id}`,
      email: request.subscription.user.email,
      samcartProductId: null,
      samcartProductName: request.subscription.product.name,
      samcartOrderId: request.subscription.samcartOrderId,
      samcartSubscriptionId: samcartId,
      samcartCustomerId: request.subscription.samcartCustomerId,
      amountCents: request.subscription.amountCents,
      currency: request.subscription.currency,
      gateway: request.subscription.gateway,
      interval: request.subscription.interval,
      periodEnd,
      cancelAt: periodEnd,
    }),
  );

  await afterSamcart("request status", request.id, () =>
    prisma.cancellationRequest.update({
      where: { id: request.id },
      data: {
        status: "succeeded",
        samcartConfirmedAt: result.confirmedAt,
        error: null,
      },
    }),
  );

  await afterSamcart("confirmation email", request.id, () =>
    sendTransactionalEmail({
      to: request.subscription.user.email,
      subject: "Your Vegan University membership cancellation is confirmed",
      html: cancellationConfirmedHtml({
        name: request.subscription.user.profile?.displayName ?? "there",
        productName: request.subscription.product.name,
        accessNote: accessNote(scheduled, periodEnd),
      }),
    }),
  );

  await afterSamcart("success audit", request.id, () =>
    writeAuditLog({
      actorId: input.userId,
      action: "billing.cancel.succeeded",
      targetType: "subscription",
      targetId: request.subscriptionId,
      metadata: {
        when: scheduled ? "period_end" : "now",
        periodEnd: periodEnd?.toISOString() ?? null,
      },
    }),
  );

  return { ok: true as const, scheduled, periodEnd };
}

/** "November 7, 2026". SamCart's dates are UTC, so the day is read in UTC. */
export function formatAccessDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

function accessNote(scheduled: boolean, periodEnd: Date | null) {
  const open = periodEnd && periodEnd > new Date();
  if (scheduled) {
    return open
      ? `Your membership will not renew. You keep full access to everything you have paid for until ${formatAccessDate(periodEnd)}; after that, access ends.`
      : "Your membership will not renew. You keep full access to everything until the end of the billing period you have already paid for; after that, access ends.";
  }
  return open
    ? `Your access continues until ${formatAccessDate(periodEnd)}.`
    : "Your access has ended.";
}

/** Closing the account: billing stops now rather than at the period's end. */
async function cancelNow(samcartId: string) {
  const result = await cancelSamcartSubscription(samcartId);
  return result.ok ? { ...result, outcome: "ended" as const } : result;
}

/**
 * A step after SamCart has answered. SamCart's answer is the outcome the
 * member is shown; a step that fails here is logged, never thrown, so an
 * email or audit outage cannot replace that outcome with a 500.
 */
async function afterSamcart(step: string, requestId: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    console.error(`[billing] cancellation ${requestId}: ${step} failed after SamCart answered`, error);
  }
}

async function failRequest(id: string, error: string) {
  await prisma.cancellationRequest.update({
    where: { id },
    data: { status: "failed", error },
  });
}

async function notifyFailure(email: string, name: string | null | undefined, productName: string) {
  await sendTransactionalEmail({
    to: email,
    subject: "We could not cancel your Vegan University membership yet",
    html: cancellationFailedHtml({
      name: name ?? "there",
      productName,
    }),
  });
}
