import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { applyCanonicalEvent } from "@/lib/billing/apply";
import { cancelSamcartSubscription } from "@/lib/billing/samcart-api";
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

export async function confirmCancellation(input: {
  requestId: string;
  userId: string;
  reason: string;
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

  const result = await cancelSamcartSubscription(samcartId);
  if (!result.ok) {
    await failRequest(request.id, result.error);
    await notifyFailure(
      request.subscription.user.email,
      request.subscription.user.profile?.displayName,
      request.subscription.product.name,
    );
    await writeAuditLog({
      actorId: input.userId,
      action: "billing.cancel.failed",
      targetType: "subscription",
      targetId: request.subscriptionId,
      metadata: { error: result.error },
    });
    return { ok: false as const, error: result.error };
  }

  await applyCanonicalEvent({
    type: "canceled",
    rawType: "member_cancel_confirmed",
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
    periodEnd: result.periodEnd ?? request.subscription.periodEnd,
    cancelAt: result.periodEnd ?? request.subscription.periodEnd,
  });

  await prisma.cancellationRequest.update({
    where: { id: request.id },
    data: {
      status: "succeeded",
      samcartConfirmedAt: result.confirmedAt,
      error: null,
    },
  });

  const accessNote = result.periodEnd
    ? `SamCart reported access through ${result.periodEnd.toDateString()}. We use that period as the source of truth.`
    : "SamCart confirmed cancellation and did not report a remaining period, so access ends now.";

  await sendTransactionalEmail({
    to: request.subscription.user.email,
    subject: "Your Vegan University membership cancellation is confirmed",
    html: cancellationConfirmedHtml({
      name: request.subscription.user.profile?.displayName ?? "there",
      productName: request.subscription.product.name,
      accessNote,
    }),
  });

  await writeAuditLog({
    actorId: input.userId,
    action: "billing.cancel.succeeded",
    targetType: "subscription",
    targetId: request.subscriptionId,
    metadata: { periodEnd: result.periodEnd?.toISOString() ?? null },
  });

  return { ok: true as const, periodEnd: result.periodEnd };
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
