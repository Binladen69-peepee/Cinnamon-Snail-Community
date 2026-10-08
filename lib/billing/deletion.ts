import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { isPayingStatus } from "@/lib/billing/types";
import { confirmCancellation, startCancellation } from "@/lib/billing/cancel";
import { getDeletionGraceDays } from "@/lib/billing/config";
import { sendTransactionalEmail } from "@/lib/email/send";
import { cancelWelcomeDm } from "@/lib/messages/welcome";
import { deletionRequestedHtml } from "@/lib/email/templates/billing";

export async function requestAccountDeletion(userId: string, reason?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true, subscriptions: true },
  });

  const paid = user.subscriptions.filter((item) => isPayingStatus(item.status));
  if (paid.length > 0) {
    const results = [];
    for (const subscription of paid) {
      const { request } = await startCancellation(userId, subscription.id);
      const confirmed = await confirmCancellation({
        requestId: request.id,
        userId,
        reason: reason ?? "account_deletion",
        // The account is closing, so billing stops now, not at the period's end.
        when: "now",
      });
      results.push(confirmed);
      if (!confirmed.ok) {
        await writeAuditLog({
          actorId: userId,
          action: "account.deletion.blocked",
          targetType: "user",
          targetId: userId,
          metadata: { error: confirmed.error },
        });
        return {
          ok: false as const,
          error:
            "SamCart has not confirmed cancellation, so we will not close this paid account yet.",
        };
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: "PENDING_DELETION",
      deletionRequestedAt: new Date(),
    },
  });

  // A member who signs up and closes the account inside the delay window must
  // not be greeted afterwards. The sweep would also refuse to send to a
  // non-ACTIVE user, but cancelling here means the queue reflects reality
  // rather than carrying a send that can never happen.
  await cancelWelcomeDm(userId, "account-deletion-requested").catch(() => 0);

  await writeAuditLog({
    actorId: userId,
    action: "account.deletion.requested",
    targetType: "user",
    targetId: userId,
  });
  await sendTransactionalEmail({
    to: user.email,
    subject: "We received your Vegan University deletion request",
    html: deletionRequestedHtml({
      name: user.profile?.displayName ?? "there",
      graceDays: getDeletionGraceDays(),
    }),
  });
  return { ok: true as const };
}

export async function purgeDueDeletions(graceDays: number, now = new Date()) {
  if (!Number.isFinite(graceDays) || graceDays <= 0) {
    return { purged: 0, skipped: true as const };
  }
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
  const due = await prisma.user.findMany({
    where: {
      status: "PENDING_DELETION",
      deletionRequestedAt: { lte: cutoff },
    },
  });
  for (const user of due) {
    await cancelWelcomeDm(user.id, "account-purged").catch(() => 0);
    // "Personal data is purged" is what the deletion email promises. The
    // account row stays (posts keep an author, now "Deleted member"); what
    // identifies or locates the person goes: addresses (which also frees them
    // to register again), password, sign-ins, push devices and the profile's
    // own words, place and survey answers. One transaction, so a purge is never
    // half done.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          status: "DELETED",
          deletedAt: now,
          email: `deleted+${user.id}@invalid.local`,
          name: null,
          image: null,
          passwordHash: null,
        },
      }),
      prisma.profile.updateMany({
        where: { userId: user.id },
        data: {
          displayName: "Deleted member",
          avatarUrl: null,
          bio: null,
          city: null,
          region: null,
          country: null,
          cityLatitude: null,
          cityLongitude: null,
          cookingInterests: Prisma.DbNull,
          dietaryInterests: Prisma.DbNull,
          links: Prisma.DbNull,
          surveyTraits: Prisma.DbNull,
          cookingLately: null,
          cookVibe: null,
          suckiestThing: null,
          primaryBenefit: null,
          timezone: null,
          directoryVisible: false,
          matchingOptIn: false,
        },
      }),
      prisma.profileInterest.deleteMany({ where: { profile: { userId: user.id } } }),
      prisma.userEmail.deleteMany({ where: { userId: user.id } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.pushSubscription.deleteMany({ where: { userId: user.id } }),
      prisma.account.deleteMany({ where: { userId: user.id } }),
    ]);
    await writeAuditLog({
      action: "account.deletion.purged",
      targetType: "user",
      targetId: user.id,
    });
  }
  return { purged: due.length, skipped: false as const };
}
