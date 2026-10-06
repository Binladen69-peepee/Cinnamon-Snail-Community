import "server-only";
import { prisma } from "@/lib/db";
import { safeTimeZone } from "@/lib/events/timezone";
import { blockedWith } from "@/lib/bulletin/blocks";
import { bulletinItemHref, type BulletinCardData } from "@/lib/bulletin/card";
import {
  CARD_EXCERPT,
  happeningLabel,
  happeningState,
  placeLabel,
  placeState,
  plainSummary,
  serviceLabel,
  serviceState,
} from "@/lib/bulletin/post-content";

export type { BulletinCardData, BulletinCardState, BulletinKind } from "@/lib/bulletin/card";

/**
 * Bulletin Board items as they appear in the Kitchen Table (DEC-078).
 *
 * CONTRACT between the Kitchen Table feed and the Bulletin Board:
 * - A Bulletin Board item (MemberCard, Happening or Place) is backed by one
 *   Post of type BULLETIN in the Kitchen Table space. Reactions and comments
 *   live on that post, so both views show the same thread (lib/bulletin/posts).
 * - The feed loader calls `loadBulletinCards(postIds, viewerId)` for the
 *   BULLETIN posts on a page and hands each card's data to the post card,
 *   which renders `<BulletinFeedCard data={…} />` from
 *   components/bulletin/feed-card.tsx.
 *
 * What the map leaves out, on purpose:
 * - **Addresses.** Neither a gathering's encrypted address nor a place's
 *   street address is ever selected here, so neither can reach the card, the
 *   wire or the browser. The card carries the city.
 * - **Blocked people.** A gathering or a service from someone the reader
 *   blocked, or who blocked the reader, gets no card, as it gets no listing on
 *   the board. (A place is a business, not a person, so it keeps its card.)
 * - **Unreviewed text.** A service card being checked again after an edit
 *   shows the title its post carries, the one staff approved, and no summary,
 *   city or category from the edit.
 * - **Posts with no item.** Their post card renders as an ordinary post.
 *
 * Five queries whatever the page size: blocks, then the three item kinds and
 * the reader's time zone side by side.
 */
export async function loadBulletinCards(
  postIds: string[],
  viewerId: string,
): Promise<Map<string, BulletinCardData>> {
  const ids = [...new Set(postIds.filter((id) => typeof id === "string" && id.length > 0))];
  const cards = new Map<string, BulletinCardData>();
  if (ids.length === 0 || !viewerId) return cards;

  const now = new Date();
  const blocked = [...(await blockedWith(viewerId))];

  const [happenings, services, places, profile] = await Promise.all([
    prisma.happening.findMany({
      where: { postId: { in: ids } },
      select: {
        id: true,
        postId: true,
        hostUserId: true,
        kind: true,
        title: true,
        description: true,
        city: true,
        startsAt: true,
        canceledAt: true,
        capacity: true,
        post: { select: { title: true } },
        rsvps: { where: { userId: viewerId }, select: { status: true }, take: 1 },
        _count: {
          select: {
            rsvps: { where: { status: "approved", userId: { notIn: blocked } } },
          },
        },
      },
    }),
    prisma.memberCard.findMany({
      where: { postId: { in: ids } },
      select: {
        id: true,
        postId: true,
        userId: true,
        title: true,
        body: true,
        category: true,
        city: true,
        status: true,
        user: { select: { status: true } },
        post: { select: { title: true } },
      },
    }),
    prisma.place.findMany({
      where: { postId: { in: ids } },
      select: {
        id: true,
        postId: true,
        name: true,
        category: true,
        veganStatus: true,
        city: true,
        status: true,
        post: { select: { title: true } },
      },
    }),
    prisma.profile.findUnique({ where: { userId: viewerId }, select: { timezone: true } }),
  ]);

  const blockedSet = new Set(blocked);
  const timeZone = safeTimeZone(profile?.timezone);

  for (const row of happenings) {
    if (!row.postId || blockedSet.has(row.hostUserId)) continue;
    const state = happeningState(row, now);
    const active = state === "live";
    const rsvp = row.rsvps[0]?.status;
    cards.set(row.postId, {
      postId: row.postId,
      kind: "happening",
      itemId: row.id,
      title: row.post?.title || row.title,
      summary: active ? plainSummary(row.description, CARD_EXCERPT) : "",
      city: row.city,
      startsAt: row.startsAt.toISOString(),
      label: happeningLabel(row.kind),
      href: bulletinItemHref("happening", row.id),
      active,
      state,
      timeZone,
      going: row._count.rsvps,
      capacity: row.capacity,
      viewerRsvp:
        rsvp === "requested" || rsvp === "approved" || rsvp === "declined" ? rsvp : null,
      isHost: row.hostUserId === viewerId,
    });
  }

  for (const row of services) {
    if (!row.postId || blockedSet.has(row.userId)) continue;
    const state = serviceState({ status: row.status, ownerActive: row.user.status === "ACTIVE" });
    const active = state === "live";
    cards.set(row.postId, {
      postId: row.postId,
      kind: "service",
      itemId: row.id,
      title: row.post?.title || row.title || "Member service",
      summary: active ? plainSummary(row.body, CARD_EXCERPT) : "",
      city: active ? row.city : null,
      startsAt: null,
      label: active ? serviceLabel(row.category) : null,
      href: bulletinItemHref("service", row.id),
      active,
      state,
      timeZone,
    });
  }

  for (const row of places) {
    if (!row.postId) continue;
    const state = placeState(row);
    cards.set(row.postId, {
      postId: row.postId,
      kind: "place",
      itemId: row.id,
      title: row.post?.title || row.name,
      summary: "",
      city: row.city,
      startsAt: null,
      label: placeLabel(row.category, row.veganStatus),
      href: bulletinItemHref("place", row.id),
      active: state === "live",
      state,
      timeZone,
    });
  }

  return cards;
}
