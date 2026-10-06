import "server-only";
import { prisma } from "@/lib/db";
import { ensureWeeklyMatch } from "@/lib/social/suggestions";
import { recentRecognition } from "@/lib/social/badges";
import { getMemberVisibility } from "@/lib/community/member-visibility";
import { matchOpener, weekStart } from "@/lib/social/scoring";
import { canMessage } from "@/lib/messages/conversations";
import { conversationMemberKey } from "@/lib/messages/permissions";
import { loadViewerCrews, type ViewerCrews } from "@/lib/crews/views";
import { groupBadgeCatalog, type Recognition } from "@/lib/social/recognition";

/**
 * Everything `/connect` shows, in one call.
 *
 * BUILD.md §12 has four parts. "People you should meet" already lives on the
 * Kitchen Table and the directory, so this page carries the other three: the
 * weekly match (§12.1), crews (§12.3, which replaced cohorts in DEC-078) and
 * recognition (§12.4).
 *
 * The weekly match is generated lazily on first view of the week. That is what
 * `ensureWeeklyMatch` was written for: it is idempotent per week, so a reload
 * or a prefetch finds the stored match rather than drawing a second one.
 *
 * Anyone the viewer may not see is filtered out after the fact too. A match is
 * stored for the week, and the person in it can hide themselves or block the
 * viewer on Tuesday; the same goes for a name in the recognition list.
 *
 * The badge catalogue comes grouped by ladder (`lib/social/recognition.ts`),
 * and a retired badge is listed only for a member who holds it.
 */

export type MatchingState =
  | { kind: "on" }
  | { kind: "paused"; until: Date }
  | { kind: "off" }
  | { kind: "no-profile" };

export type WeeklyMatch = {
  id: string;
  status: "SUGGESTED" | "SAVED" | "PASSED" | "CONNECTED";
  reason: string;
  /** The message "Message <name>" pre-fills: editable, never sent for them. */
  opener: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  /** Whether a direct message would be accepted right now, and if not, why. */
  messaging: { allowed: true } | { allowed: false; reason: string };
  /** Their existing one-to-one thread, when the viewer is in it. */
  conversationId: string | null;
};

export type ConnectData = {
  matching: MatchingState;
  match: WeeklyMatch | null;
  nextMatchAt: Date;
  crews: ViewerCrews;
  /** The badge catalogue, grouped by ladder, with what the viewer holds. */
  badges: Recognition;
  recognition: {
    id: string;
    awardedAt: Date;
    badgeName: string;
    badgeIcon: string | null;
    reason: string | null;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  }[];
};

export async function loadConnect(viewerId: string, now = new Date()): Promise<ConnectData> {
  const profile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    select: { matchingOptIn: true, matchingPausedUntil: true },
  });

  const matching: MatchingState = !profile
    ? { kind: "no-profile" }
    : !profile.matchingOptIn
      ? { kind: "off" }
      : profile.matchingPausedUntil && profile.matchingPausedUntil > now
        ? { kind: "paused", until: profile.matchingPausedUntil }
        : { kind: "on" };

  const [rawMatch, crews, catalog, held, recent, visibility] = await Promise.all([
    matching.kind === "on" ? ensureWeeklyMatch(viewerId, now) : null,
    loadViewerCrews(viewerId),
    prisma.badge.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        slug: true,
        name: true,
        description: true,
        icon: true,
        criteria: true,
        sortOrder: true,
      },
    }),
    prisma.memberBadge.findMany({
      where: { userId: viewerId },
      select: { awardedAt: true, reason: true, badge: { select: { slug: true } } },
    }),
    recentRecognition(12),
    getMemberVisibility(viewerId),
  ]);

  let match: WeeklyMatch | null = null;
  if (rawMatch && !visibility.hiddenIds.has(rawMatch.matchedUserId)) {
    const displayName = rawMatch.matchedUser.profile?.displayName ?? rawMatch.matchedUser.handle;
    const [decision, thread] = await Promise.all([
      canMessage(viewerId, rawMatch.matchedUserId),
      prisma.conversation.findUnique({
        where: { memberKey: conversationMemberKey([viewerId, rawMatch.matchedUserId]) },
        select: { id: true, members: { where: { userId: viewerId }, select: { leftAt: true } } },
      }),
    ]);
    match = {
      id: rawMatch.id,
      status: rawMatch.status,
      reason: rawMatch.reason,
      opener: matchOpener(rawMatch.starter, displayName),
      handle: rawMatch.matchedUser.handle,
      displayName,
      avatarUrl: rawMatch.matchedUser.profile?.avatarUrl ?? null,
      city: rawMatch.matchedUser.profile?.city ?? null,
      messaging: decision.allowed ? { allowed: true } : { allowed: false, reason: decision.reason },
      conversationId:
        thread && thread.members[0] && !thread.members[0].leftAt ? thread.id : null,
    };
  }

  const badges = groupBadgeCatalog({
    catalog,
    held: held.map((row) => ({
      slug: row.badge.slug,
      awardedAt: row.awardedAt,
      reason: row.reason,
    })),
  });

  const recognition = recent
    .filter((row) => !visibility.hiddenHandles.has(row.user.handle))
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      awardedAt: row.awardedAt,
      badgeName: row.badge.name,
      badgeIcon: row.badge.icon,
      reason: row.reason,
      handle: row.user.handle,
      displayName: row.user.profile?.displayName ?? row.user.handle,
      avatarUrl: row.user.profile?.avatarUrl ?? null,
    }));

  return {
    matching,
    match,
    nextMatchAt: new Date(weekStart(now).getTime() + 7 * 86_400_000),
    crews,
    badges,
    recognition,
  };
}
