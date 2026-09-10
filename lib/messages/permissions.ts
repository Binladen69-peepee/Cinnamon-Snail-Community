import type { DmPreference } from "@prisma/client";

export type DmSubject = {
  userId: string;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";
  dmPreference: DmPreference;
};

export type DmRelationship = {
  /** Either side has blocked the other. */
  blocked: boolean;
  /** They already share a conversation, so the door is open both ways. */
  priorConversation: boolean;
  /** Members-only or private spaces both people belong to. */
  sharedSpaces: number;
};

export type DmDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * DEC-016: a "connection" is someone you have already messaged, or someone who
 * shares a members-only/private space with you. `CONNECTIONS` accepts either.
 */
export function isConnection(relationship: DmRelationship): boolean {
  return relationship.priorConversation || relationship.sharedSpaces > 0;
}

export function canSendDirectMessage(
  sender: DmSubject,
  recipient: DmSubject,
  relationship: DmRelationship,
): DmDecision {
  if (sender.userId === recipient.userId) {
    return { allowed: false, reason: "You cannot message yourself." };
  }
  if (sender.status !== "ACTIVE") {
    return { allowed: false, reason: "Your account cannot send messages right now." };
  }
  if (recipient.status !== "ACTIVE") {
    return { allowed: false, reason: "That member is no longer active." };
  }
  if (relationship.blocked) {
    return { allowed: false, reason: "You cannot message this member." };
  }
  if (recipient.dmPreference === "NOBODY") {
    return {
      allowed: false,
      reason: "This member has turned off direct messages.",
    };
  }
  if (recipient.dmPreference === "CONNECTIONS" && !isConnection(relationship)) {
    return {
      allowed: false,
      reason:
        "This member only accepts messages from connections. Join a space together or reply in the community first.",
    };
  }
  return { allowed: true };
}

/** Group conversations are small by design — the spec says "small groups". */
export const MAX_GROUP_MEMBERS = 8;

export function canCreateGroup(memberCount: number): DmDecision {
  if (memberCount < 2) {
    return { allowed: false, reason: "Pick at least one other member." };
  }
  if (memberCount > MAX_GROUP_MEMBERS) {
    return {
      allowed: false,
      reason: `Group messages hold up to ${MAX_GROUP_MEMBERS} people.`,
    };
  }
  return { allowed: true };
}

/**
 * Stable identity for a conversation's participant set, so repeated attempts to
 * start the same 1:1 thread reuse one row instead of creating duplicates.
 */
export function conversationMemberKey(userIds: string[]): string {
  return [...new Set(userIds)].sort().join(":");
}

export function unreadCount(
  messages: { createdAt: Date; authorId: string }[],
  viewerId: string,
  lastReadAt: Date | null,
): number {
  return messages.filter(
    (message) =>
      message.authorId !== viewerId &&
      (lastReadAt === null || message.createdAt > lastReadAt),
  ).length;
}

/** Typing indicators go stale quickly; nobody types for six seconds straight. */
export const TYPING_TTL_MS = 6000;

export function isTyping(typingAt: Date | null, now = new Date()): boolean {
  if (!typingAt) return false;
  return now.getTime() - typingAt.getTime() < TYPING_TTL_MS;
}
