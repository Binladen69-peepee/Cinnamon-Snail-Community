import "server-only";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";
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
  const unique = [...new Set(recipientIds.filter((id) => id !== creatorId))];
  const decision = canCreateGroup(unique.length + 1);
  if (!decision.allowed) throw new MessagePermissionError(decision.reason);
  for (const recipientId of unique) {
    await assertCanMessage(creatorId, recipientId);
  }
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
}) {
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
  // Re-check the gate on every send: preferences and blocks change mid-thread.
  for (const other of others) {
    await assertCanMessage(input.authorId, other.userId);
  }

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      authorId: input.authorId,
      body,
      imageUrl,
    },
  });
  const now = new Date();
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    }),
    // Sending is also reading, and it clears your own typing flag.
    prisma.conversationMember.update({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.authorId,
        },
      },
      data: { lastReadAt: now, typingAt: null },
    }),
  ]);

  const authorName =
    membership.conversation.members.find((member) => member.userId === input.authorId)
      ?.user.profile?.displayName ?? "A member";
  await Promise.all(
    others.map((other) =>
      createNotification({
        userId: other.userId,
        category: "DMS",
        title: `${authorName} sent you a message`,
        body: body.slice(0, 140) || "Shared an image",
        href: `/messages/${input.conversationId}`,
      }),
    ),
  );
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

  const unreadRows = await Promise.all(
    memberships.map((membership) =>
      prisma.message.count({
        where: {
          conversationId: membership.conversationId,
          authorId: { not: userId },
          deletedAt: null,
          ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
        },
      }),
    ),
  );

  return memberships.map((membership, index) => {
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
      unread: unreadRows[index],
    };
  });
}

export async function totalUnreadForUser(userId: string): Promise<number> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return 0;
  const counts = await Promise.all(
    memberships.map((membership) =>
      prisma.message.count({
        where: {
          conversationId: membership.conversationId,
          authorId: { not: userId },
          deletedAt: null,
          ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
        },
      }),
    ),
  );
  return counts.reduce((total, count) => total + count, 0);
}

export async function readConversation(conversationId: string, userId: string) {
  const membership = await requireMembership(conversationId, userId);
  if (!membership) return null;
  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      author: {
        select: {
          id: true,
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  });
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
