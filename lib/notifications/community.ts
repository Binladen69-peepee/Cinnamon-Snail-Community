import { prisma } from "@/lib/db";
import type { NotificationCategory } from "@prisma/client";
import { parsePrefs, wants } from "@/lib/notifications/preferences";

/**
 * Every notification the community feature sends.
 *
 * Centralised on purpose. Notifications written ad hoc at each call site drift
 * apart: one respects the member's preferences and another does not, one links
 * to the post and another to the space, one remembers not to notify you about
 * your own reply and another does not. All of that is decided once, here.
 *
 * Fan-out is the reason this is written in bulk. A mention of twenty people, or
 * a new post in a space with a thousand members, must not become a thousand
 * round trips: preferences are read in one query and the rows are inserted in
 * one statement.
 */

export type NotificationDraft = {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string;
};

/** Nobody is notified about their own action, ever. */
function withoutActor(drafts: NotificationDraft[], actorId: string) {
  return drafts.filter((draft) => draft.userId !== actorId);
}

/**
 * Writes many notifications, honouring each recipient's preferences.
 *
 * SYSTEM is never suppressed, matching the single-notification path: billing
 * and account notices are not opt-out.
 */
export async function createNotifications(
  drafts: NotificationDraft[],
): Promise<number> {
  if (drafts.length === 0) return 0;
  const userIds = [...new Set(drafts.map((draft) => draft.userId))];
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, notificationPrefs: true },
  });
  const prefsByUser = new Map(
    profiles.map((profile) => [profile.userId, parsePrefs(profile.notificationPrefs)]),
  );

  const allowed = drafts.filter((draft) => {
    const prefs = prefsByUser.get(draft.userId);
    // No profile row means no stated preference, so the default applies rather
    // than silence.
    if (!prefs) return true;
    return wants(prefs, "inApp", draft.category);
  });
  if (allowed.length === 0) return 0;

  const result = await prisma.notification.createMany({
    data: allowed.map((draft) => ({
      userId: draft.userId,
      channel: "IN_APP" as const,
      category: draft.category,
      title: draft.title,
      body: draft.body,
      href: draft.href,
    })),
  });
  return result.count;
}

/** People named with an @handle in a post or comment. */
export async function notifyMentions(input: {
  handles: string[];
  actorId: string;
  actorName: string;
  spaceName: string;
  href: string;
}): Promise<string[]> {
  if (input.handles.length === 0) return [];
  const mentioned = await prisma.user.findMany({
    where: { handle: { in: input.handles.slice(0, 20) }, status: "ACTIVE" },
    select: { id: true, handle: true },
  });
  await createNotifications(
    withoutActor(
      mentioned.map((user) => ({
        userId: user.id,
        category: "MENTIONS" as const,
        title: "You were mentioned",
        body: `${input.actorName} mentioned you in ${input.spaceName}.`,
        href: input.href,
      })),
      input.actorId,
    ),
  );
  return mentioned.map((user) => user.id);
}

/**
 * A reply: the post's author hears about it, and so does the author of the
 * comment being answered.
 *
 * Both, and each only once. Answering your own comment on your own post used
 * to be capable of notifying you twice.
 */
export async function notifyReply(input: {
  actorId: string;
  actorName: string;
  postAuthorId: string;
  parentAuthorId?: string | null;
  postTitle: string;
  href: string;
}) {
  const recipients = new Set<string>();
  recipients.add(input.postAuthorId);
  if (input.parentAuthorId) recipients.add(input.parentAuthorId);
  recipients.delete(input.actorId);

  await createNotifications(
    [...recipients].map((userId) => ({
      userId,
      category: "REPLIES" as const,
      title:
        userId === input.parentAuthorId && userId !== input.postAuthorId
          ? "Someone replied to you"
          : "New reply to your post",
      body: `${input.actorName} replied to ${input.postTitle}.`,
      href: input.href,
    })),
  );
}

/**
 * A new post in a space, sent to the members who asked to hear about it.
 *
 * Expensive by nature, so it is called from `after()` rather than on the
 * request path, and it is bounded: a space with more members than the cap
 * notifies the most recently active of them rather than everyone. A feature
 * that works until a space gets popular is not a feature.
 *
 * The member's own setting wins over the space default, and either can mean
 * silence.
 */
export const SPACE_FANOUT_CAP = 2000;

export async function notifySpacePost(input: {
  spaceId: string;
  spaceName: string;
  actorId: string;
  actorName: string;
  postId: string;
  title: string;
  highlighted?: boolean;
}) {
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: { notificationDefault: true },
  });
  if (!space) return;

  // A member who set their own level is governed by it. A member who never
  // touched it follows whatever the space says, which is why the null case is
  // decided by the space default rather than assumed to mean "yes".
  const defaultNotifies =
    space.notificationDefault === "ALL" ||
    (space.notificationDefault === "HIGHLIGHTS" && input.highlighted === true);

  const members = await prisma.spaceMembership.findMany({
    where: {
      spaceId: input.spaceId,
      userId: { not: input.actorId },
      OR: [
        { notificationLevel: "ALL" },
        ...(input.highlighted ? [{ notificationLevel: "HIGHLIGHTS" as const }] : []),
        ...(defaultNotifies ? [{ notificationLevel: null }] : []),
      ],
    },
    select: { userId: true },
    orderBy: { createdAt: "desc" },
    take: SPACE_FANOUT_CAP,
  });

  const userIds = [...new Set(members.map((row) => row.userId))];

  await createNotifications(
    userIds.map((userId) => ({
      userId,
      category: "SPACE_ACTIVITY" as const,
      title: `New in ${input.spaceName}`,
      body: `${input.actorName}: ${input.title}`,
      href: `/posts/${input.postId}`,
    })),
  );
}

/** A host was handed something to approve. */
export async function notifyPendingPost(input: {
  spaceId: string;
  spaceName: string;
  actorId: string;
  actorName: string;
  postId: string;
}) {
  const hosts = await prisma.spaceMembership.findMany({
    where: { spaceId: input.spaceId, role: { in: ["HOST", "MODERATOR"] } },
    select: { userId: true },
    take: 50,
  });
  await createNotifications(
    withoutActor(
      hosts.map((host) => ({
        userId: host.userId,
        category: "HOST_ANNOUNCEMENTS" as const,
        title: "A post is waiting for review",
        body: `${input.actorName} posted in ${input.spaceName}.`,
        href: `/spaces/${input.spaceId}/review`,
      })),
      input.actorId,
    ),
  );
}

/** The author, once a host has decided. */
export async function notifyApprovalDecision(input: {
  authorId: string;
  spaceName: string;
  postId: string;
  approved: boolean;
}) {
  await createNotifications([
    {
      userId: input.authorId,
      category: "HOST_ANNOUNCEMENTS",
      title: input.approved ? "Your post is live" : "Your post was not published",
      body: input.approved
        ? `A host approved your post in ${input.spaceName}.`
        : `A host declined your post in ${input.spaceName}.`,
      href: input.approved ? `/posts/${input.postId}` : undefined,
    },
  ]);
}
