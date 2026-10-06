import "server-only";
import { prisma } from "@/lib/db";
import { getMemberVisibility } from "@/lib/community/member-visibility";
import { readPrivacy } from "@/lib/community/privacy";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { MEMBERSHIP_PRODUCT_KINDS } from "@/lib/crews/eligibility";
import { crewReason, type CrewKindName } from "@/lib/crews/labels";

/**
 * What members see of crews: their own, the ones they can join, and one
 * crew's page (DEC-078).
 *
 * Who is in an automatic crew says something about a person — their survey
 * answers, their roadmap, when they joined — so the member list of a cohort,
 * roadmap or survey crew is shown to the people in it (and staff), not to
 * everybody. Opt-in crews are open: joining one is a public choice, and the
 * join button says so. Either way the list goes through the same visibility
 * rule as the directory: members who hide themselves, and anyone on either
 * side of a block with the viewer, are not named.
 */

export type CrewCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: CrewKindName;
  /** Active accounts in the crew. A count only; nobody is named by it. */
  memberCount: number;
  /** How the viewer is in it, if they are. */
  joined: "AUTO" | "OPT_IN" | null;
  reason: string | null;
  /** The crew chat, when it exists and the viewer has a seat in it. */
  chatId: string | null;
};

export type ViewerCrews = {
  mine: CrewCard[];
  joinable: CrewCard[];
  /** Whether SamCart has told us when the viewer started (their cohort crew). */
  startKnown: boolean;
};

const ACTIVE_MEMBERS = { members: { where: { user: { status: "ACTIVE" as const } } } };

export async function loadViewerCrews(viewerId: string): Promise<ViewerCrews> {
  const [crews, start] = await Promise.all([
    prisma.crew.findMany({
      where: {
        archivedAt: null,
        OR: [{ kind: "OPTIONAL" }, { members: { some: { userId: viewerId } } }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        kind: true,
        ruleKey: true,
        conversationId: true,
        _count: { select: ACTIVE_MEMBERS },
        members: { where: { userId: viewerId }, select: { source: true } },
      },
    }),
    prisma.subscription.findFirst({
      where: {
        userId: viewerId,
        startedAt: { not: null },
        product: { kind: { in: [...MEMBERSHIP_PRODUCT_KINDS] } },
      },
      select: { id: true },
    }),
  ]);

  const chatIds = crews.flatMap((crew) => (crew.conversationId ? [crew.conversationId] : []));
  const seats = chatIds.length
    ? await prisma.conversationMember.findMany({
        where: { userId: viewerId, conversationId: { in: chatIds }, leftAt: null },
        select: { conversationId: true },
      })
    : [];
  const seated = new Set(seats.map((seat) => seat.conversationId));

  const cards: CrewCard[] = crews.map((crew) => {
    const joined = crew.members[0]?.source ?? null;
    return {
      id: crew.id,
      slug: crew.slug,
      name: crew.name,
      description: crew.description,
      kind: crew.kind,
      memberCount: crew._count.members,
      joined,
      reason: crewReason({ kind: crew.kind, ruleKey: crew.ruleKey, source: joined }),
      chatId:
        crew.conversationId && seated.has(crew.conversationId) ? crew.conversationId : null,
    };
  });

  return {
    mine: cards.filter((card) => card.joined !== null),
    joinable: cards.filter((card) => card.joined === null && card.kind === "OPTIONAL"),
    startKnown: Boolean(start),
  };
}

export type CrewPageMember = {
  userId: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  isViewer: boolean;
};

export type CrewPageData = {
  crew: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    kind: CrewKindName;
    archived: boolean;
    memberCount: number;
  };
  joined: "AUTO" | "OPT_IN" | null;
  reason: string | null;
  /** The viewer has a seat in the crew chat right now. */
  inChat: boolean;
  /** Whether the member list is shown to this viewer at all. */
  canSeeMembers: boolean;
  members: CrewPageMember[];
  /** Members the viewer may see, across all pages. */
  visibleCount: number;
  /** Members in the crew the viewer may not see by name. */
  privateCount: number;
  page: number;
  pageCount: number;
};

export const CREW_PAGE_SIZE = 40;

export async function loadCrewPage(input: {
  slug: string;
  viewerId: string;
  staff: boolean;
  page?: number;
}): Promise<CrewPageData | null> {
  const crew = await prisma.crew.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      kind: true,
      ruleKey: true,
      archivedAt: true,
      conversationId: true,
      _count: { select: ACTIVE_MEMBERS },
      members: { where: { userId: input.viewerId }, select: { source: true } },
    },
  });
  if (!crew) return null;
  const joined = crew.members[0]?.source ?? null;
  // An archived crew is history for the people who were in it.
  if (crew.archivedAt && !joined && !input.staff) return null;

  const canSeeMembers = crew.kind === "OPTIONAL" || joined !== null || input.staff;

  const [seat, rows, visibility] = await Promise.all([
    crew.conversationId
      ? prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: { conversationId: crew.conversationId, userId: input.viewerId },
          },
          select: { leftAt: true },
        })
      : null,
    canSeeMembers
      ? prisma.crewMember.findMany({
          where: { crewId: crew.id, user: { status: "ACTIVE" } },
          select: {
            userId: true,
            user: {
              select: {
                handle: true,
                profile: {
                  select: { displayName: true, avatarUrl: true, city: true, privacy: true },
                },
              },
            },
          },
        })
      : [],
    getMemberVisibility(input.viewerId),
  ]);

  const visible: CrewPageMember[] = rows
    .filter((row) => row.userId === input.viewerId || !visibility.hiddenIds.has(row.userId))
    .map((row) => {
      const name = row.user.profile?.displayName ?? row.user.handle;
      return {
        userId: row.userId,
        handle: row.user.handle,
        name,
        avatarUrl: resolveMemberAvatar(row.user.handle, row.user.profile?.avatarUrl, name),
        // A city is shown only where its owner lets it be (Settings → Privacy).
        city:
          row.userId === input.viewerId || readPrivacy(row.user.profile?.privacy).showLocation
            ? (row.user.profile?.city ?? null)
            : null,
        isViewer: row.userId === input.viewerId,
      };
    })
    .sort((a, b) =>
      a.isViewer !== b.isViewer ? (a.isViewer ? -1 : 1) : a.name.localeCompare(b.name),
    );

  const pageCount = Math.max(1, Math.ceil(visible.length / CREW_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), pageCount);

  return {
    crew: {
      id: crew.id,
      slug: crew.slug,
      name: crew.name,
      description: crew.description,
      kind: crew.kind,
      archived: Boolean(crew.archivedAt),
      memberCount: crew._count.members,
    },
    joined,
    reason: crewReason({ kind: crew.kind, ruleKey: crew.ruleKey, source: joined }),
    inChat: Boolean(seat && !seat.leftAt),
    canSeeMembers,
    members: visible.slice((page - 1) * CREW_PAGE_SIZE, page * CREW_PAGE_SIZE),
    visibleCount: visible.length,
    privateCount: canSeeMembers ? Math.max(0, rows.length - visible.length) : 0,
    page,
    pageCount,
  };
}
