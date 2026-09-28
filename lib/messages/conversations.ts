import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
import { afterResponse } from "@/lib/after-response";
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
        },
      },
    },
  });
  if (!membership || membership.leftAt) return null;
  return membership;
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
  return prisma.conversation.create({
    data: {
      isGroup: false,
      memberKey,
      members: {
        create: [{ userId: senderId }, { userId: recipientId }],
      },
    },
  });
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
  // Re-checked on every send, because a preference or a block can change in
  // the middle of a thread. One pass for the whole group rather than one gate
  // per recipient.
  await assertCanMessageAll(
    input.authorId,
    others.map((other) => other.userId),
  );

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
  // not worth making the sender wait for, and `createNotification` honours
  // each recipient's own preferences so a muted member is skipped there.
  afterResponse(async () => {
    await Promise.all(
      others.map((other) =>
        createNotification({
          userId: other.userId,
          category: "DMS",
          title: `${authorName} sent you a message`,
          body: body.slice(0, 140) || "Shared an image",
          href: `/messages/${input.conversationId}`,
        }).catch(() => undefined),
      ),
    );
  });

  return message;
}

export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null },
    include: {
      conversation: {
        include: {
          members: {
            where: { userId: { not: userId } },
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
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { author: { select: { id: true, handle: true } } },
          },
        },
      },
    },
    orderBy: [
      { conversation: { lastMessageAt: "desc" } },
      { conversation: { createdAt: "desc" } },
    ],
  });

  // One grouped count for the whole inbox rather than a COUNT per thread.
  // The previous shape issued a query per conversation, so a member with sixty
  // threads paid sixty round trips to render one list -- the classic N+1, and
  // the thing that makes an inbox slow exactly when someone uses it most.
  const unreadGroups =
    memberships.length === 0
      ? []
      : await prisma.message.groupBy({
          by: ["conversationId"],
          where: {
            authorId: { not: userId },
            deletedAt: null,
            OR: memberships.map((membership) => ({
              conversationId: membership.conversationId,
              ...(membership.lastReadAt
                ? { createdAt: { gt: membership.lastReadAt } }
                : {}),
            })),
          },
          _count: { _all: true },
        });
  const unreadByConversation = new Map(
    unreadGroups.map((row) => [row.conversationId, row._count._all] as const),
  );

  return memberships.map((membership) => {
    const others = membership.conversation.members;
    return {
      id: membership.conversationId,
      isGroup: membership.conversation.isGroup,
      title:
        membership.conversation.title ??
        others
          .map((member) => member.user.profile?.displayName ?? member.user.handle)
          .join(", ") ??
        "Conversation",
      others: others.map((member) => ({
        id: member.user.id,
        handle: member.user.handle,
        name: member.user.profile?.displayName ?? member.user.handle,
        avatarUrl: member.user.profile?.avatarUrl ?? null,
      })),
      lastMessage: membership.conversation.messages[0] ?? null,
      lastMessageAt: membership.conversation.lastMessageAt,
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
export async function totalUnreadForUser(userId: string): Promise<number> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return 0;

  const groups = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      authorId: { not: userId },
      deletedAt: null,
      OR: memberships.map((membership) => ({
        conversationId: membership.conversationId,
        ...(membership.lastReadAt
          ? { createdAt: { gt: membership.lastReadAt } }
          : {}),
      })),
    },
    _count: { _all: true },
  });

  return groups.reduce((total, row) => total + row._count._all, 0);
}

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

  const take = Math.min(Math.max(input.take ?? MESSAGE_PAGE, 1), 100);
  const rows = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId,
      deletedAt: null,
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
  const rows = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE + 1,
    include: { author: MESSAGE_AUTHOR },
  });
  const hasMore = rows.length > MESSAGE_PAGE;
  const messages = rows.slice(0, MESSAGE_PAGE).reverse();
  const others = membership.conversation.members.filter(
    (member) => member.userId !== userId,
  );
  const blockedIds = await prisma.userBlock.findMany({
    where: { blockerId: userId, blockedId: { in: others.map((o) => o.userId) } },
    select: { blockedId: true },
  });
  return {
    id: conversationId,
    isGroup: membership.conversation.isGroup,
    title:
      membership.conversation.title ??
      others
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
