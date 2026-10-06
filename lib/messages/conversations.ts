import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { afterResponse } from "@/lib/after-response";
import { awardBadgesAfterResponse } from "@/lib/social/badge-triggers";
import { guardMessageAction } from "@/lib/messages/rate-limits";
import {
  canCreateGroup,
  canSendDirectMessage,
  conversationMemberKey,
  isTyping,
  MAX_GROUP_MEMBERS,
  TYPING_TTL_MS,
  type DmSubject,
} from "@/lib/messages/permissions";

export { MAX_GROUP_MEMBERS, TYPING_TTL_MS };

export class MessagePermissionError extends Error {}

async function loadSubject(userId: string): Promise<DmSubject | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, profile: { select: { dmPreference: true } } },
  });
  if (!user) return null;
  return {
    userId: user.id,
    status: user.status,
    dmPreference: user.profile?.dmPreference ?? "EVERYONE",
  };
}

export async function blockExistsBetween(a: string, b: string): Promise<boolean> {
  const count = await prisma.userBlock.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return count > 0;
}

async function sharedSpaceCount(a: string, b: string): Promise<number> {
  const mine = await prisma.spaceMembership.findMany({
    where: { userId: a, space: { visibility: { in: ["MEMBERS", "PRIVATE"] } } },
    select: { spaceId: true },
  });
  if (mine.length === 0) return 0;
  return prisma.spaceMembership.count({
    where: { userId: b, spaceId: { in: mine.map((row) => row.spaceId) } },
  });
}

async function priorConversationExists(a: string, b: string): Promise<boolean> {
  const count = await prisma.conversation.count({
    where: {
      AND: [
        { members: { some: { userId: a } } },
        { members: { some: { userId: b } } },
      ],
      messages: { some: {} },
    },
  });
  return count > 0;
}

/**
 * The same gate, asked once for a whole group.
 *
 * `assertCanMessage` costs about five queries, and `sendMessage` called it
 * once per recipient — so a message to a group of eight ran roughly thirty-five
 * queries before it wrote anything. The rules are identical; only the number of
 * round trips differs, and the decision still comes from the one pure function
 * so the two paths cannot drift apart.
 */
export async function assertCanMessageAll(
  senderId: string,
  recipientIds: string[],
): Promise<void> {
  const others = [...new Set(recipientIds)].filter((id) => id !== senderId);
  if (others.length === 0) return;

  const [sender, recipients, blocks, senderSpaces, priorThreads] = await Promise.all([
    loadSubject(senderId),
    prisma.user.findMany({
      where: { id: { in: others } },
      select: {
        id: true,
        status: true,
        profile: { select: { dmPreference: true } },
      },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerId: senderId, blockedId: { in: others } },
          { blockerId: { in: others }, blockedId: senderId },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.spaceMembership.findMany({
      where: {
        userId: senderId,
        space: { visibility: { in: ["MEMBERS", "PRIVATE"] } },
      },
      select: { spaceId: true },
    }),
    prisma.conversation.findMany({
      where: {
        members: { some: { userId: senderId } },
        messages: { some: {} },
      },
      select: { members: { select: { userId: true } } },
    }),
  ]);

  if (!sender) throw new MessagePermissionError("That member could not be found.");

  const spaceIds = senderSpaces.map((row) => row.spaceId);
  const shared = spaceIds.length
    ? await prisma.spaceMembership.groupBy({
        by: ["userId"],
        where: { userId: { in: others }, spaceId: { in: spaceIds } },
        _count: { _all: true },
      })
    : [];
  const sharedByUser = new Map(shared.map((row) => [row.userId, row._count._all]));

  const blockedIds = new Set(
    blocks.flatMap((row) => [row.blockerId, row.blockedId]).filter((id) => id !== senderId),
  );
  const priorIds = new Set(
    priorThreads.flatMap((thread) =>
      thread.members.map((member) => member.userId),
    ),
  );

  const byId = new Map(recipients.map((row) => [row.id, row]));
  for (const recipientId of others) {
    const row = byId.get(recipientId);
    if (!row) throw new MessagePermissionError("That member could not be found.");
    const decision = canSendDirectMessage(
      sender,
      {
        userId: row.id,
        status: row.status,
        dmPreference: row.profile?.dmPreference ?? "EVERYONE",
      },
      {
        blocked: blockedIds.has(recipientId),
        sharedSpaces: sharedByUser.get(recipientId) ?? 0,
        priorConversation: priorIds.has(recipientId),
      },
    );
    if (!decision.allowed) throw new MessagePermissionError(decision.reason);
  }
}

/** The full server-side gate. Every write path calls this before touching data. */
export async function assertCanMessage(senderId: string, recipientId: string) {
  const [sender, recipient] = await Promise.all([
    loadSubject(senderId),
    loadSubject(recipientId),
  ]);
  if (!sender || !recipient) {
    throw new MessagePermissionError("That member could not be found.");
  }
  const [blocked, sharedSpaces, priorConversation] = await Promise.all([
    blockExistsBetween(senderId, recipientId),
    sharedSpaceCount(senderId, recipientId),
    priorConversationExists(senderId, recipientId),
  ]);
  const decision = canSendDirectMessage(sender, recipient, {
    blocked,
    sharedSpaces,
    priorConversation,
  });
  if (!decision.allowed) {
    throw new MessagePermissionError(decision.reason);
  }
}

export async function canMessage(senderId: string, recipientId: string) {
  try {
    await assertCanMessage(senderId, recipientId);
    return { allowed: true as const };
  } catch (error) {
    if (error instanceof MessagePermissionError) {
      return { allowed: false as const, reason: error.message };
    }
    throw error;
  }
}

/**
 * Membership is the only key to a thread. Reads and writes both go through this,
 * so a guessed conversation id gets a 404, never someone else's messages.
 */
export async function requireMembership(conversationId: string, userId: string) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: {
      conversation: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  handle: true,
                  status: true,
                  profile: { select: { displayName: true, avatarUrl: true } },
                },
              },
            },
          },
          // Set when this thread is a crew's group chat (DEC-078).
          crew: { select: { id: true, slug: true, name: true, kind: true, archivedAt: true } },
        },
      },
    },
  });
  if (!membership || membership.leftAt) return null;
  return membership;
}

/**
 * Everyone on either side of a block with this member. In a crew chat their
 * messages are not shown to each other: a crew is a group space, so a block
 * cannot stop the other person talking to the crew, but it does mean neither
 * has to read the other.
 */
export async function blockedAuthorIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [
    ...new Set(rows.flatMap((row) => [row.blockerId, row.blockedId]).filter((id) => id !== viewerId)),
  ];
}

/**
 * The gate for writing in a crew chat. The crew is a group the member is in,
 * not a private inbox, so direct-message preferences do not apply; what does
 * is being an active member of the crew, and the crew not being archived.
 */
async function assertCanWriteToCrew(
  crew: { id: string; archivedAt: Date | null },
  authorId: string,
): Promise<void> {
  if (crew.archivedAt) {
    throw new MessagePermissionError("This crew has been archived, so its chat is read-only.");
  }
  const [author, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: authorId }, select: { status: true } }),
    prisma.crewMember.findUnique({
      where: { crewId_userId: { crewId: crew.id, userId: authorId } },
      select: { id: true },
    }),
  ]);
  if (author?.status !== "ACTIVE") {
    throw new MessagePermissionError("Your account cannot send messages right now.");
  }
  if (!member) {
    throw new MessagePermissionError("Only members of this crew can write in its chat.");
  }
}

export async function findOrCreateDirectConversation(
  senderId: string,
  recipientId: string,
) {
  await guardMessageAction("start", senderId);
  await assertCanMessage(senderId, recipientId);
  const memberKey = conversationMemberKey([senderId, recipientId]);
  const existing = await prisma.conversation.findUnique({ where: { memberKey } });
  if (existing) {
    // A member who left a 1:1 thread and comes back rejoins the same row.
    await prisma.conversationMember.updateMany({
      where: { conversationId: existing.id, userId: senderId },
      data: { leftAt: null },
    });
    return existing;
  }
  try {
    return await prisma.conversation.create({
      data: {
        isGroup: false,
        memberKey,
        members: {
          create: [{ userId: senderId }, { userId: recipientId }],
        },
      },
    });
  } catch (error) {
    // Two taps at once (or both people starting the thread together) race on
    // the unique member key; the loser opens the thread the winner created.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.conversation.findUnique({ where: { memberKey } });
      if (winner) return winner;
    }
    throw error;
  }
}

export async function createGroupConversation(
  creatorId: string,
  recipientIds: string[],
  title: string | null,
) {
  await guardMessageAction("start", creatorId);
  const unique = [...new Set(recipientIds.filter((id) => id !== creatorId))];
  const decision = canCreateGroup(unique.length + 1);
  if (!decision.allowed) throw new MessagePermissionError(decision.reason);
  // One pass rather than a full gate per person invited.
  await assertCanMessageAll(creatorId, unique);
  const memberIds = [creatorId, ...unique];
  return prisma.conversation.create({
    data: {
      isGroup: true,
      title: title?.trim() || null,
      // Group threads are not deduplicated: the same people may want several.
      memberKey: null,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
}

export async function sendMessage(input: {
  conversationId: string;
  authorId: string;
  body: string;
  imageUrl?: string | null;
  /**
   * A key the client generates per composed message. Sending the same key
   * twice returns the first message instead of writing a second — which is
   * what makes a double tap, a retry after a timeout, and an optimistic
   * resend all safe.
   */
  clientId?: string | null;
}) {
  await guardMessageAction("send", input.authorId);

  const membership = await requireMembership(input.conversationId, input.authorId);
  if (!membership) {
    throw new MessagePermissionError("This conversation is not available.");
  }
  const body = input.body.trim();
  const imageUrl = input.imageUrl?.trim() || null;
  if (!body && !imageUrl) {
    throw new MessagePermissionError("Write something first.");
  }
  if (body.length > 4000) {
    throw new MessagePermissionError("Messages are limited to 4000 characters.");
  }

  const others = membership.conversation.members.filter(
    (member) => member.userId !== input.authorId && !member.leftAt,
  );
  const crew = membership.conversation.crew;
  if (crew) {
    // A crew chat is the crew's own space: being in the crew is the
    // permission, re-checked on every send because membership can end.
    await assertCanWriteToCrew(crew, input.authorId);
  } else {
    // Re-checked on every send, because a preference or a block can change
    // in the middle of a thread. One pass for the whole group rather than one
    // gate per recipient.
    await assertCanMessageAll(
      input.authorId,
      others.map((other) => other.userId),
    );
  }

  const clientId = input.clientId?.trim() || null;

  // The write is one transaction: the message, the thread's ordering, and the
  // sender's own read mark. They were three statements with the insert outside
  // the transaction, so a failure between them left a thread whose
  // `lastMessageAt` disagreed with its newest message — which is what the
  // inbox sorts on.
  let message;
  try {
    message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          authorId: input.authorId,
          body,
          imageUrl,
          clientId,
        },
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      // Sending is also reading, and it clears your own typing flag.
      await tx.conversationMember.update({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.authorId,
          },
        },
        data: { lastReadAt: created.createdAt, typingAt: null },
      });
      return created;
    });
  } catch (error) {
    // P2002 on (conversationId, clientId): this exact message is already
    // sent. Hand back the one that won rather than failing the caller, who
    // would otherwise show an error for a message that did arrive.
    if (
      clientId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.message.findFirst({
        where: { conversationId: input.conversationId, clientId },
      });
      if (existing) return existing;
    }
    throw error;
  }

  const authorName =
    membership.conversation.members.find((member) => member.userId === input.authorId)
      ?.user.profile?.displayName ?? "A member";

  // After the response. Telling four people about a message is worth doing and
  // not worth making the sender wait for. One batched write for every
  // recipient, honouring each one's preferences and blocks, keyed to the
  // message so a retried send cannot notify twice. The text stays in the
  // inbox only: email and push say who wrote, never what.
  const sentId = message.id;
  const sentAt = message.createdAt;
  afterResponse(async () => {
    if (crew) {
      await notifyCrewChat({
        crewName: crew.name,
        conversationId: input.conversationId,
        authorId: input.authorId,
        recipientIds: others.map((other) => other.userId),
        sentAt,
      });
      return;
    }
    await dispatchNotifications(
      others.map((other) => ({
        userId: other.userId,
        category: "DMS" as const,
        title: `${authorName} sent you a message`,
        body: body.slice(0, 140) || "Shared an image",
        href: `/messages/${input.conversationId}`,
        actorId: input.authorId,
        dedupeKey: `dm:${sentId}`,
      })),
    ).catch(() => undefined);
  });

  // The Conversations badge counts one-to-one threads where both people
  // wrote, so the reply that makes a thread two-way can earn it, for both of
  // them. Who that is gets worked out after the response, like the rest.
  if (!crew && !membership.conversation.isGroup) {
    await awardBadgesAfterResponse(
      () =>
        madeTwoWayBy({
          conversationId: input.conversationId,
          authorId: input.authorId,
          messageId: sentId,
          sentAt,
        }),
      "conversation-two-way",
    );
  }

  return message;
}

/**
 * The two people in a one-to-one thread, when this message is what made it
 * two-way: the author's first message there (nothing of theirs before it),
 * and the other person has written too. Anything else is no one.
 *
 * Deleted messages are left out, exactly as the badge counts them.
 */
async function madeTwoWayBy(input: {
  conversationId: string;
  authorId: string;
  messageId: string;
  sentAt: Date;
}): Promise<string[]> {
  const [earlierOwn, other] = await Promise.all([
    prisma.message.count({
      where: {
        conversationId: input.conversationId,
        authorId: input.authorId,
        deletedAt: null,
        id: { not: input.messageId },
        createdAt: { lte: input.sentAt },
      },
    }),
    prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        authorId: { not: input.authorId },
        deletedAt: null,
      },
      select: { authorId: true },
    }),
  ]);
  if (earlierOwn > 0 || !other) return [];
  return [input.authorId, other.authorId];
}

/**
 * A crew chat is a room, not a letter: a message per notification would bury
 * every member of a busy crew, and a direct-message email for each one would
 * be worse. So the crew hears about its chat at most once a day — on the first
 * message of the day — as group activity, which is in-app by default and
 * never emailed unless the member asked for it. The unread count in Messages
 * carries the rest.
 */
async function notifyCrewChat(input: {
  crewName: string;
  conversationId: string;
  authorId: string;
  recipientIds: string[];
  sentAt: Date;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;
  const day = input.sentAt.toISOString().slice(0, 10);
  const earlierToday = await prisma.message.count({
    where: {
      conversationId: input.conversationId,
      createdAt: { gte: new Date(`${day}T00:00:00.000Z`), lt: input.sentAt },
    },
  });
  if (earlierToday > 0) return;
  await dispatchNotifications(
    input.recipientIds.map((userId) => ({
      userId,
      category: "SPACE_ACTIVITY" as const,
      title: `New messages in ${input.crewName}`,
      body: "Your crew is talking. Jump in when you have a minute.",
      href: `/messages/${input.conversationId}`,
      actorId: input.authorId,
      dedupeKey: `crewchat:${input.conversationId}:${day}`,
    })),
  ).catch(() => undefined);
}

/**
 * In a crew chat, a message whose author is on either side of a block with
 * the viewer is not theirs to read (see `blockedAuthorIds`), so it does not
 * count as unread either. Everywhere else blocks already stop the message
 * being sent, so the clause only ever bites in crew chats. `m` is the message.
 */
function notHiddenInCrewChat(userId: string) {
  return Prisma.sql`NOT EXISTS (
    SELECT 1
    FROM "Crew" c
    JOIN "UserBlock" b
      ON (b."blockerId" = ${userId} AND b."blockedId" = m."authorId")
      OR (b."blockerId" = m."authorId" AND b."blockedId" = ${userId})
    WHERE c."conversationId" = m."conversationId"
  )`;
}

export type ConversationKind = "direct" | "group" | "crew";

const INBOX_AUTHOR = {
  select: { id: true, handle: true, profile: { select: { displayName: true } } },
} as const;

/** "Sam Rivera, Jo, Lee" with a "+3" when there are more than it names. */
function groupTitle(names: string[], total: number): string {
  if (names.length === 0) return "Conversation";
  const extra = total - names.length;
  return extra > 0 ? `${names.join(", ")} +${extra}` : names.join(", ");
}

export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null },
    include: {
      conversation: {
        include: {
          // A row shows a face or two; a crew chat can hold hundreds.
          members: {
            where: { userId: { not: userId } },
            orderBy: { id: "asc" },
            take: 4,
            include: {
              user: {
                select: {
                  id: true,
                  handle: true,
                  profile: { select: { displayName: true, avatarUrl: true } },
                },
              },
            },
          },
          _count: { select: { members: { where: { leftAt: null } } } },
          crew: { select: { slug: true, name: true, archivedAt: true } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { author: INBOX_AUTHOR },
          },
        },
      },
    },
    orderBy: [
      { conversation: { lastMessageAt: "desc" } },
      { conversation: { createdAt: "desc" } },
    ],
  });

  // One grouped count for the whole inbox rather than a COUNT per thread: the
  // same join as the badge below, so the two cannot disagree.
  const unreadRows =
    memberships.length === 0
      ? []
      : await prisma.$queryRaw<{ conversationId: string; unread: number }[]>`
          SELECT m."conversationId" AS "conversationId", count(*)::int AS unread
          FROM "Message" m
          JOIN "ConversationMember" cm
            ON cm."conversationId" = m."conversationId"
          WHERE cm."userId" = ${userId}
            AND cm."leftAt" IS NULL
            AND m."authorId" <> ${userId}
            AND m."deletedAt" IS NULL
            AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
            AND ${notHiddenInCrewChat(userId)}
          GROUP BY m."conversationId"
        `;
  const unreadByConversation = new Map(
    unreadRows.map((row) => [row.conversationId, row.unread] as const),
  );

  // A crew chat whose newest message is from someone the viewer does not see
  // previews the newest one they do. Rare, so asked per thread.
  const hidden = memberships.some((membership) => membership.conversation.crew)
    ? await blockedAuthorIds(userId)
    : [];
  const previews = new Map<string, (typeof memberships)[number]["conversation"]["messages"][number] | null>();
  if (hidden.length > 0) {
    for (const membership of memberships) {
      const last = membership.conversation.messages[0];
      if (!membership.conversation.crew || !last || !hidden.includes(last.authorId)) continue;
      previews.set(
        membership.conversationId,
        await prisma.message.findFirst({
          where: {
            conversationId: membership.conversationId,
            deletedAt: null,
            authorId: { notIn: hidden },
          },
          orderBy: { createdAt: "desc" },
          include: { author: INBOX_AUTHOR },
        }),
      );
    }
  }

  return memberships.map((membership) => {
    const { conversation } = membership;
    const others = conversation.members;
    const kind: ConversationKind = conversation.crew
      ? "crew"
      : conversation.isGroup
        ? "group"
        : "direct";
    const names = others.map((member) => member.user.profile?.displayName ?? member.user.handle);
    return {
      id: membership.conversationId,
      isGroup: conversation.isGroup,
      kind,
      crew: conversation.crew
        ? {
            slug: conversation.crew.slug,
            name: conversation.crew.name,
            archived: Boolean(conversation.crew.archivedAt),
          }
        : null,
      title:
        conversation.title ??
        (kind === "direct"
          ? // Nobody left on the other side: their account was deleted.
            (names[0] ?? "Former member")
          : groupTitle(names.slice(0, 3), conversation._count.members - 1)),
      /** Everyone still in the thread, the viewer included. */
      memberCount: conversation._count.members,
      others: others.map((member) => ({
        id: member.user.id,
        handle: member.user.handle,
        name: member.user.profile?.displayName ?? member.user.handle,
        avatarUrl: member.user.profile?.avatarUrl ?? null,
      })),
      lastMessage: previews.has(membership.conversationId)
        ? previews.get(membership.conversationId)!
        : (conversation.messages[0] ?? null),
      lastMessageAt: conversation.lastMessageAt,
      unread: unreadByConversation.get(membership.conversationId) ?? 0,
    };
  });
}

/**
 * The badge on the messages icon.
 *
 * This ran a `COUNT` per conversation, and it runs on **every** member page —
 * twice, because the header and the shell each ask. A member with sixty
 * threads therefore paid a hundred and twenty round trips to render any page
 * in the app, which is the single most expensive thing in it. PROJECT.md
 * listed it as known limit 1.
 *
 * One grouped count now, with the same per-conversation "since I last read"
 * boundary expressed as an OR. The shape matches `listConversations`, which
 * was fixed the same way earlier.
 */
/**
 * The unread badge: every message from someone else, in a conversation the
 * member is still in, newer than the point they last read it to.
 *
 * One join rather than a membership read plus a `groupBy` whose `OR` grew by
 * a clause for every conversation the member had ever joined. The
 * `(conversationId, createdAt, id)` index answers each side of the join.
 *
 * Memoised per request with `cache()`: the member layout and the app header
 * both ask for it while rendering the same page, and without this every
 * member page paid for it twice.
 */
export const totalUnreadForUser = cache(async (userId: string): Promise<number> => {
  const rows = await prisma.$queryRaw<{ unread: number }[]>`
    SELECT count(*)::int AS unread
    FROM "Message" m
    JOIN "ConversationMember" cm
      ON cm."conversationId" = m."conversationId"
    WHERE cm."userId" = ${userId}
      AND cm."leftAt" IS NULL
      AND m."authorId" <> ${userId}
      AND m."deletedAt" IS NULL
      AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
      AND ${notHiddenInCrewChat(userId)}
  `;
  return rows[0]?.unread ?? 0;
});

/** One page of a thread. Enough to fill a screen and scroll a little. */
export const MESSAGE_PAGE = 40;

const MESSAGE_AUTHOR = {
  select: {
    id: true,
    handle: true,
    profile: { select: { displayName: true, avatarUrl: true } },
  },
} as const;

/**
 * Older messages, one page at a time.
 *
 * `before` is the id of the oldest message the client already holds. Keyed on
 * `(createdAt, id)` rather than on an offset, because a thread gains messages
 * while somebody scrolls back through it and an offset page would then repeat
 * or skip one.
 */
export async function loadOlderMessages(input: {
  conversationId: string;
  userId: string;
  before: string;
  take?: number;
}) {
  const membership = await requireMembership(input.conversationId, input.userId);
  if (!membership) return null;

  const anchor = await prisma.message.findFirst({
    where: { id: input.before, conversationId: input.conversationId },
    select: { createdAt: true, id: true },
  });
  if (!anchor) return { messages: [], hasMore: false };

  const hidden = membership.conversation.crew ? await blockedAuthorIds(input.userId) : [];
  const take = Math.min(Math.max(input.take ?? MESSAGE_PAGE, 1), 100);
  const rows = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId,
      deletedAt: null,
      ...(hidden.length ? { authorId: { notIn: hidden } } : {}),
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: { author: MESSAGE_AUTHOR },
  });

  const page = rows.slice(0, take);
  return {
    // Back into reading order once the window has been chosen.
    messages: page.reverse(),
    hasMore: rows.length > take,
  };
}

/**
 * A thread, opened at the bottom.
 *
 * This took the **oldest** two hundred messages — `orderBy: asc, take: 200` —
 * so a conversation with three hundred in it opened on the first two hundred
 * and never showed anything recent. The newest page is what a messaging app
 * opens on, so the window is taken from the end and turned back into reading
 * order, with a cursor for scrolling up.
 */
export async function readConversation(conversationId: string, userId: string) {
  const membership = await requireMembership(conversationId, userId);
  if (!membership) return null;
  const crew = membership.conversation.crew;
  // In a crew chat, people either side of a block with the viewer stay in
  // the crew but out of the viewer's view (see `blockedAuthorIds`).
  const hiddenAuthorIds = crew ? await blockedAuthorIds(userId) : [];
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(hiddenAuthorIds.length ? { authorId: { notIn: hiddenAuthorIds } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE + 1,
    include: { author: MESSAGE_AUTHOR },
  });
  const hasMore = rows.length > MESSAGE_PAGE;
  const messages = rows.slice(0, MESSAGE_PAGE).reverse();
  const everyoneElse = membership.conversation.members.filter(
    (member) => member.userId !== userId,
  );
  // A crew chat is a room: its header points to the crew page for the people
  // in it, rather than shipping a crowd to the browser for receipts nobody
  // can use at that size.
  const others = crew ? [] : everyoneElse;
  const blockedIds = others.length
    ? await prisma.userBlock.findMany({
        where: { blockerId: userId, blockedId: { in: others.map((o) => o.userId) } },
        select: { blockedId: true },
      })
    : [];
  const kind: ConversationKind = crew ? "crew" : membership.conversation.isGroup ? "group" : "direct";
  return {
    id: conversationId,
    isGroup: membership.conversation.isGroup,
    kind,
    crew: crew
      ? { slug: crew.slug, name: crew.name, kind: crew.kind, archived: Boolean(crew.archivedAt) }
      : null,
    /** Everyone still in the thread, the viewer included. */
    memberCount: everyoneElse.filter((member) => !member.leftAt).length + 1,
    hiddenAuthorIds,
    title:
      membership.conversation.title ??
      everyoneElse
        .map((member) => member.user.profile?.displayName ?? member.user.handle)
        .join(", "),
    viewerLastReadAt: membership.lastReadAt,
    others: others.map((member) => ({
      id: member.userId,
      handle: member.user.handle,
      name: member.user.profile?.displayName ?? member.user.handle,
      avatarUrl: member.user.profile?.avatarUrl ?? null,
      // Read receipt: how far this person has read.
      lastReadAt: member.lastReadAt,
      typing: isTyping(member.typingAt),
      blockedByViewer: blockedIds.some((row) => row.blockedId === member.userId),
    })),
    messages,
    hasMore,
  };
}

export async function markConversationRead(conversationId: string, userId: string) {
  const membership = await requireMembership(conversationId, userId);
  if (!membership) return;
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
}

export async function setTyping(conversationId: string, userId: string) {
  // The one endpoint that takes a write on something close to every keystroke.
  // The client throttles, but a client is not a control.
  await guardMessageAction("typing", userId);
  const membership = await requireMembership(conversationId, userId);
  if (!membership) return;
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { typingAt: new Date() },
  });
}

export async function blockMember(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw new MessagePermissionError("You cannot block yourself.");
  }
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
}

export async function unblockMember(blockerId: string, blockedId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
}

export async function reportMessage(input: {
  reporterId: string;
  messageId: string;
  reason: string;
  details?: string;
}) {
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: { id: true, authorId: true, conversationId: true },
  });
  if (!message) throw new MessagePermissionError("That message no longer exists.");
  // Only someone in the thread can report what was said in it.
  const membership = await requireMembership(message.conversationId, input.reporterId);
  if (!membership) {
    throw new MessagePermissionError("This conversation is not available.");
  }
  return prisma.report.create({
    data: {
      reporterId: input.reporterId,
      messageId: message.id,
      subjectUserId: message.authorId,
      reason: input.reason,
      details: input.details,
    },
  });
}

export async function leaveConversation(conversationId: string, userId: string) {
  const membership = await requireMembership(conversationId, userId);
  if (!membership) return;
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { leftAt: new Date(), typingAt: null },
  });
}
