import { prisma } from "@/lib/db";
import {
  dispatchNotifications,
  type NotificationDraft,
} from "@/lib/notifications/dispatch";

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
 * round trips: `dispatchNotifications` reads preferences, blocks and push
 * subscriptions in one query each and writes the rows in one statement.
 *
 * Every notifier passes the actor (so self-notifications and blocked senders
 * are dropped there) and a `dedupeKey` naming its source, so the same mention
 * or the same new post can never notify the same member twice — not when a
 * post is edited, not when a job is retried.
 */

export type { NotificationDraft };

/** Writes many notifications, honouring each recipient's preferences. */
export async function createNotifications(drafts: NotificationDraft[]): Promise<number> {
  const result = await dispatchNotifications(drafts);
  return result.created;
}

/** People named with an @handle in a post or comment. */
export async function notifyMentions(input: {
  handles: string[];
  actorId: string;
  actorName: string;
  spaceName: string;
  href: string;
  /** The post or comment the mention is in, e.g. `post:<id>`. */
  source: string;
}): Promise<string[]> {
  if (input.handles.length === 0) return [];
  const mentioned = await prisma.user.findMany({
    where: { handle: { in: input.handles.slice(0, 20) }, status: "ACTIVE" },
    select: { id: true, handle: true },
  });
  await createNotifications(
    mentioned.map((user) => ({
      userId: user.id,
      category: "MENTIONS" as const,
      title: "You were mentioned",
      body: `${input.actorName} mentioned you in ${input.spaceName}.`,
      href: input.href,
      actorId: input.actorId,
      dedupeKey: `mention:${input.source}`,
    })),
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
  commentId: string;
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
      actorId: input.actorId,
      dedupeKey: `reply:${input.commentId}`,
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
      actorId: input.actorId,
      dedupeKey: `space-post:${input.postId}`,
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
    hosts.map((host) => ({
      userId: host.userId,
      category: "HOST_ANNOUNCEMENTS" as const,
      title: "A post is waiting for review",
      body: `${input.actorName} posted in ${input.spaceName}.`,
      href: `/spaces/${input.spaceId}/review`,
      actorId: input.actorId,
      dedupeKey: `pending-post:${input.postId}`,
    })),
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
      dedupeKey: `post-decision:${input.postId}`,
    },
  ]);
}
