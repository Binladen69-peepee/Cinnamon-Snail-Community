import "server-only";
import { prisma } from "@/lib/db";
import { loadMemberSignals } from "@/lib/social/signals";
import { matchOpener, rankSuggestions, weekStart, type Suggestion } from "@/lib/social/scoring";
import { getMemberVisibility } from "@/lib/community/member-visibility";
import {
  MessagePermissionError,
  canMessage,
  findOrCreateDirectConversation,
} from "@/lib/messages/conversations";
import { MessageRateLimitError } from "@/lib/messages/rate-limits";

export type PeopleSuggestion = Suggestion & {
  handle: string;
  avatarUrl: string | null;
  city: string | null;
};

/** BUILD.md §12.2 — "People you should meet": 3–5, each with an explicit reason. */
export async function peopleYouShouldMeet(
  viewerId: string,
  limit = 4,
): Promise<PeopleSuggestion[]> {
  const { viewer, candidates } = await loadMemberSignals(viewerId);
  if (!viewer) return [];
  const ranked = rankSuggestions(viewer, candidates, limit);
  if (ranked.length === 0) return [];

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: ranked.map((item) => item.userId) } },
    select: {
      userId: true,
      avatarUrl: true,
      city: true,
      user: { select: { handle: true } },
    },
  });
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));

  return ranked.flatMap((suggestion) => {
    const profile = byUser.get(suggestion.userId);
    if (!profile) return [];
    return [
      {
        ...suggestion,
        handle: profile.user.handle,
        avatarUrl: profile.avatarUrl,
        city: profile.city,
      },
    ];
  });
}

/**
 * BUILD.md §12.1 — weekly matching. Idempotent: running twice in the same week
 * returns the match already stored rather than generating a second one.
 */
export async function ensureWeeklyMatch(viewerId: string, now = new Date()) {
  const profile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { matchingOptIn: true, matchingPausedUntil: true },
  });
  if (!profile?.matchingOptIn) return null;
  if (profile.matchingPausedUntil && profile.matchingPausedUntil > now) return null;

  const week = weekStart(now);
  const existing = await prisma.memberMatch.findFirst({
    where: { userId: viewerId, weekStart: week },
    include: {
      matchedUser: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true, city: true } },
        },
      },
    },
  });
  if (existing) return existing;

  const { viewer, candidates } = await loadMemberSignals(viewerId);
  if (!viewer) return null;
  // Don't re-match someone this member was matched with in the last eight weeks.
  const recent = await prisma.memberMatch.findMany({
    where: {
      userId: viewerId,
      weekStart: { gte: new Date(week.getTime() - 8 * 7 * 86_400_000) },
    },
    select: { matchedUserId: true },
  });
  const recentIds = new Set(recent.map((row) => row.matchedUserId));
  const fresh = candidates.filter((candidate) => !recentIds.has(candidate.userId));
  const [best] = rankSuggestions(viewer, fresh, 1, now);
  if (!best) return null;

  return prisma.memberMatch.create({
    data: {
      weekStart: week,
      userId: viewerId,
      matchedUserId: best.userId,
      score: best.score,
      reason: best.reason,
      starter: best.starter,
    },
    include: {
      matchedUser: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true, city: true } },
        },
      },
    },
  });
}

export async function respondToMatch(
  viewerId: string,
  matchId: string,
  status: "SAVED" | "PASSED" | "CONNECTED",
) {
  // Scoped by userId so a guessed id cannot mutate someone else's match.
  await prisma.memberMatch.updateMany({
    where: { id: matchId, userId: viewerId },
    data: { status, respondedAt: new Date() },
  });
}

export async function setMatchingPreference(
  viewerId: string,
  optIn: boolean,
  pausedUntil: Date | null,
) {
  await prisma.profile.update({
    where: { userId: viewerId },
    data: { matchingOptIn: optIn, matchingPausedUntil: pausedUntil },
  });
}

/**
 * "Message Sam" on the weekly match: one tap to a direct message with the
 * suggested opener waiting in the composer (DEC-078).
 *
 * The draft travels as a key, `match:<id>`, never as text in the URL; the
 * thread page turns it back into the opener with `resolveMatchDraft`, which
 * only does so for the member the match belongs to. Nothing is ever sent on
 * the member's behalf — the message is in the box, editable, until they send
 * it themselves.
 */
export const MATCH_DRAFT_PREFIX = "match:";

export function matchDraftKey(matchId: string): string {
  return `${MATCH_DRAFT_PREFIX}${matchId}`;
}

function matchIdFromDraftKey(draftKey: string | null | undefined): string | null {
  const match = /^match:([a-z0-9_-]{8,64})$/i.exec(draftKey?.trim() ?? "");
  return match ? match[1]! : null;
}

export type MatchConversationResult =
  | { ok: true; conversationId: string; draftKey: string }
  | { ok: false; code: "not-found" | "hidden" | "dm-refused" | "busy"; reason?: string };

/**
 * Opens (or reuses) the direct thread with this week's match. Refuses without
 * creating anything when the match is not the viewer's, when the other member
 * is hidden from them (directory opt-out, a block either way), or when their
 * message settings would refuse the message — the same rules as every other
 * way of starting a conversation.
 */
export async function startMatchConversation(
  viewerId: string,
  matchId: string,
): Promise<MatchConversationResult> {
  const match = await prisma.memberMatch.findFirst({
    where: { id: matchId, userId: viewerId },
    select: { id: true, matchedUserId: true },
  });
  if (!match) return { ok: false, code: "not-found" };

  const visibility = await getMemberVisibility(viewerId);
  if (visibility.hiddenIds.has(match.matchedUserId)) return { ok: false, code: "hidden" };

  const decision = await canMessage(viewerId, match.matchedUserId);
  if (!decision.allowed) return { ok: false, code: "dm-refused", reason: decision.reason };

  try {
    const conversation = await findOrCreateDirectConversation(viewerId, match.matchedUserId);
    return { ok: true, conversationId: conversation.id, draftKey: matchDraftKey(match.id) };
  } catch (error) {
    if (error instanceof MessageRateLimitError) return { ok: false, code: "busy" };
    if (error instanceof MessagePermissionError) {
      return { ok: false, code: "dm-refused", reason: error.message };
    }
    throw error;
  }
}

/**
 * The opener to pre-fill, or null. Only for the member who owns the match,
 * and only in their one-to-one thread with the person they were matched with
 * — the same key in anybody else's hands, or on any other thread, is nothing.
 * Once they have messaged the match, the suggestion has done its job and a
 * stale link (the back button) no longer puts it back in the box.
 */
export async function resolveMatchDraft(input: {
  viewerId: string;
  draftKey: string | null | undefined;
  conversationId: string;
}): Promise<{ key: string; body: string } | null> {
  const matchId = matchIdFromDraftKey(input.draftKey);
  if (!matchId) return null;
  const match = await prisma.memberMatch.findFirst({
    where: { id: matchId, userId: input.viewerId, status: { not: "CONNECTED" } },
    select: {
      matchedUserId: true,
      starter: true,
      matchedUser: { select: { handle: true, profile: { select: { displayName: true } } } },
    },
  });
  if (!match) return null;
  const thread = await prisma.conversation.count({
    where: {
      id: input.conversationId,
      isGroup: false,
      AND: [
        { members: { some: { userId: input.viewerId, leftAt: null } } },
        { members: { some: { userId: match.matchedUserId } } },
      ],
    },
  });
  if (thread === 0) return null;
  const name = match.matchedUser.profile?.displayName ?? match.matchedUser.handle;
  return { key: matchDraftKey(matchId), body: matchOpener(match.starter, name) };
}

/**
 * Once the member actually sends in that thread, the match shows as messaged.
 * Scoped to the owner and to a thread the matched member is in, so a forged
 * key changes nothing that is not already the sender's own.
 */
export async function markMatchMessaged(input: {
  viewerId: string;
  draftKey: string | null | undefined;
  conversationId: string;
}): Promise<void> {
  const matchId = matchIdFromDraftKey(input.draftKey);
  if (!matchId) return;
  await prisma.memberMatch.updateMany({
    where: {
      id: matchId,
      userId: input.viewerId,
      status: { not: "CONNECTED" },
      matchedUser: { conversationMembers: { some: { conversationId: input.conversationId } } },
    },
    data: { status: "CONNECTED", respondedAt: new Date() },
  });
}
