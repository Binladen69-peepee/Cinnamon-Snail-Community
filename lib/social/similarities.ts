import "server-only";
import type { InterestKind, Prisma, SkillLevel, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { INTEREST_KINDS, INTEREST_KIND_LABELS } from "@/lib/community/interests";
import { bothAllow, readPrivacy, type ProfilePrivacy } from "@/lib/community/privacy";
import { getBlockedUserIds, getMemberVisibility } from "@/lib/community/member-visibility";
import { getEventViewer, visibleEventsWhere, type EventViewer } from "@/lib/events/access";
import { listCrewsForUser, sharedCrews, type CrewSummary } from "@/lib/crews/queries";
import { classHref, crewHref, liveClassHref } from "@/lib/social/activity";

/**
 * "Show similarities": what two members have in common, Mighty Networks
 * style, worked out from the data rather than guessed at.
 *
 * There is no model here and nothing is inferred. Every line in the panel is
 * a fact both members can see for themselves: a tag you both picked, a crew
 * you are both in, a class you have both taken, a live class you both said
 * you were going to, the city you both put on your profile.
 *
 * Privacy, in the order it is checked:
 *
 * 1. **No panel at all** across a block (either direction), for yourself, or
 *    for a member who is inactive or has left the directory: the panel is a
 *    way of being found, and those members asked not to be.
 * 2. **Each line needs both members' permission** for the field it reads
 *    (`bothAllow`): interests, skill, gluten-free and roadmap need "Show how I
 *    cook" on both profiles; location needs "Show my city" on both, and is
 *    never more precise than the city. So the panel is the same seen from
 *    either side, and hiding a field hides it in both directions.
 * 3. **Interaction lines** (follows, replies, reactions) appear only when
 *    both members have member matching switched on, which is the switch that
 *    already governs whether their activity is used to connect them.
 * 4. **Only what the viewer may see**: live classes are filtered by the
 *    viewer's access, and a shared follow is never someone hidden from them.
 *
 * The same computation ranks the "Similar to you" view of the directory, so
 * a card's reason and the profile's panel can never disagree.
 */

export type InterestFact = { id: string; slug: string; label: string; kind: InterestKind };
export type ClassFact = { id: string; slug: string; title: string };
export type LiveClassFact = { id: string; slug: string; title: string; startsAt: Date };

export type SimilarityFacts = {
  userId: string;
  displayName: string;
  status: UserStatus;
  privacy: ProfilePrivacy;
  directoryVisible: boolean;
  matchingOptIn: boolean;
  skill: SkillLevel | null;
  glutenFree: boolean | null;
  city: string | null;
  region: string | null;
  country: string | null;
  interests: InterestFact[];
  roadmap: { trackId: string; name: string } | null;
  classes: ClassFact[];
  liveClasses: LiveClassFact[];
};

export type InteractionFacts = {
  viewerFollowsMember: boolean;
  memberFollowsViewer: boolean;
  /** Up to three, by name; never anyone hidden from the viewer. */
  sharedFollowees: { handle: string; displayName: string }[];
  sharedFolloweeCount: number;
  memberRepliedToViewer: number;
  viewerRepliedToMember: number;
  memberReactedToViewer: number;
  viewerReactedToMember: number;
};

export type SimilarityGroupKey =
  | "cuisine"
  | "technique"
  | "dietary"
  | "equipment"
  | "goal"
  | "cooking"
  | "roadmap"
  | "location"
  | "crews"
  | "classes"
  | "live-classes"
  | "connections";

export type SimilarityEntry = {
  key: string;
  label: string;
  href?: string;
  date?: Date;
};

export type SimilarityGroup = {
  key: SimilarityGroupKey;
  title: string;
  /** Interests read as chips; everything else as a short list. */
  display: "chips" | "list";
  entries: SimilarityEntry[];
};

export type Similarity = {
  groups: SimilarityGroup[];
  /** Things in common, for the toggle's count. */
  count: number;
  /** For ranking "Similar to you". Never shown. */
  score: number;
};

export const EMPTY_SIMILARITY: Similarity = { groups: [], count: 0, score: 0 };

/**
 * Weights for ranking. Small integers, so any ordering can be traced back to
 * the lines that produced it; caps stop one long list from drowning the rest.
 */
export const SIMILARITY_WEIGHTS = {
  interest: 3,
  interestCap: 15,
  sameSkill: 2,
  glutenFree: 3,
  roadmap: 3,
  city: 4,
  region: 2,
  country: 1,
  crew: 3,
  crewCap: 9,
  sharedClass: 2,
  classCap: 6,
  liveClass: 2,
  liveClassCap: 6,
  followEachOther: 2,
  sharedFollowee: 1,
  sharedFolloweeCap: 3,
  repliedBothWays: 2,
  repliedOneWay: 1,
  reacted: 1,
} as const;

const SKILL_WORDS: Record<SkillLevel, string> = {
  BEGINNER: "beginner",
  CONFIDENT: "confident",
  ADVANCED: "advanced",
};

const KIND_GROUP: Record<InterestKind, SimilarityGroupKey> = {
  CUISINE: "cuisine",
  TECHNIQUE: "technique",
  DIETARY: "dietary",
  EQUIPMENT: "equipment",
  GOAL: "goal",
};

const GLUTEN_FREE_SLUG = "gluten-free";

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Whether a panel may exist at all between these two. Blocks are checked by
 * the caller, which knows them; everything else is on the facts.
 */
export function similarityAllowed(input: {
  viewer: Pick<SimilarityFacts, "userId" | "status">;
  member: Pick<SimilarityFacts, "userId" | "status" | "directoryVisible">;
  blocked: boolean;
}): boolean {
  if (input.blocked) return false;
  if (input.viewer.userId === input.member.userId) return false;
  if (input.viewer.status !== "ACTIVE" || input.member.status !== "ACTIVE") return false;
  return input.member.directoryVisible;
}

/** Where two members both are, at the most precise level both share. */
export function sharedPlace(
  viewer: Pick<SimilarityFacts, "city" | "region" | "country">,
  member: Pick<SimilarityFacts, "city" | "region" | "country">,
): { level: "city" | "region" | "country"; name: string } | null {
  const countriesAgree =
    !norm(viewer.country) || !norm(member.country) || norm(viewer.country) === norm(member.country);
  if (norm(viewer.city) && norm(viewer.city) === norm(member.city) && countriesAgree) {
    return { level: "city", name: member.city!.trim() };
  }
  if (norm(viewer.region) && norm(viewer.region) === norm(member.region) && countriesAgree) {
    return { level: "region", name: member.region!.trim() };
  }
  if (norm(viewer.country) && norm(viewer.country) === norm(member.country)) {
    return { level: "country", name: member.country!.trim() };
  }
  return null;
}

/**
 * What the viewer and the member have in common, as the panel shows it.
 * Pure: everything it needs is passed in, so the privacy rules are tested
 * without a database.
 */
export function computeSimilarities(input: {
  viewer: SimilarityFacts;
  member: SimilarityFacts;
  sharedCrews: CrewSummary[];
  interactions: InteractionFacts | null;
}): Similarity {
  const { viewer, member } = input;
  if (viewer.userId === member.userId) return EMPTY_SIMILARITY;

  const W = SIMILARITY_WEIGHTS;
  const groups: SimilarityGroup[] = [];
  let score = 0;

  const howTheyCook = bothAllow(viewer.privacy, member.privacy, "showInterests");
  const whereTheyAre = bothAllow(viewer.privacy, member.privacy, "showLocation");
  const bothGlutenFree = howTheyCook && viewer.glutenFree === true && member.glutenFree === true;

  // --- interests, a group per kind ---------------------------------------
  if (howTheyCook) {
    const theirs = new Set(member.interests.map((interest) => interest.slug));
    const shared = viewer.interests.filter(
      (interest) =>
        theirs.has(interest.slug) && !(bothGlutenFree && interest.slug === GLUTEN_FREE_SLUG),
    );
    score += Math.min(shared.length * W.interest, W.interestCap);
    for (const kind of INTEREST_KINDS) {
      const entries = shared
        .filter((interest) => interest.kind === kind)
        .map((interest) => ({
          key: `interest:${interest.slug}`,
          label: interest.label,
          href: `/members?interest=${encodeURIComponent(interest.slug)}`,
        }));
      if (entries.length > 0) {
        groups.push({
          key: KIND_GROUP[kind],
          title: INTEREST_KIND_LABELS[kind],
          display: "chips",
          entries,
        });
      }
    }
  }

  // --- how they cook ------------------------------------------------------
  if (howTheyCook) {
    const entries: SimilarityEntry[] = [];
    if (viewer.skill && viewer.skill === member.skill) {
      entries.push({ key: "skill", label: `You're both ${SKILL_WORDS[viewer.skill]} cooks` });
      score += W.sameSkill;
    }
    if (bothGlutenFree) {
      entries.push({ key: "gluten-free", label: "You both cook gluten-free" });
      score += W.glutenFree;
    }
    if (entries.length > 0) {
      groups.push({ key: "cooking", title: "In the kitchen", display: "list", entries });
    }
  }

  // --- roadmap ------------------------------------------------------------
  const sameTrack =
    howTheyCook &&
    viewer.roadmap !== null &&
    member.roadmap !== null &&
    viewer.roadmap.trackId === member.roadmap.trackId;
  if (sameTrack && viewer.roadmap) {
    groups.push({
      key: "roadmap",
      title: "Roadmap",
      display: "list",
      entries: [
        {
          key: `roadmap:${viewer.roadmap.trackId}`,
          label: `You're both on the ${viewer.roadmap.name} roadmap`,
        },
      ],
    });
    score += W.roadmap;
  }

  // --- location, never finer than the city --------------------------------
  if (whereTheyAre) {
    const place = sharedPlace(viewer, member);
    if (place) {
      groups.push({
        key: "location",
        title: "Nearby",
        display: "list",
        entries: [{ key: `place:${place.level}`, label: `You're both in ${place.name}` }],
      });
      score += place.level === "city" ? W.city : place.level === "region" ? W.region : W.country;
    }
  }

  // --- crews --------------------------------------------------------------
  // The roadmap line already says "same track"; its crew would say it twice.
  const crews = input.sharedCrews.filter((crew) => !(sameTrack && crew.kind === "ROADMAP"));
  if (crews.length > 0) {
    groups.push({
      key: "crews",
      title: "Crews you're both in",
      display: "list",
      entries: crews.map((crew) => ({ key: `crew:${crew.id}`, label: crew.name, href: crewHref(crew.slug) })),
    });
    score += Math.min(crews.length * W.crew, W.crewCap);
  }

  // --- classes ------------------------------------------------------------
  const theirClasses = new Set(member.classes.map((course) => course.id));
  const classes = viewer.classes.filter((course) => theirClasses.has(course.id));
  if (classes.length > 0) {
    groups.push({
      key: "classes",
      title: "Classes you've both taken",
      display: "list",
      entries: classes.map((course) => ({
        key: `class:${course.id}`,
        label: course.title,
        href: classHref(course.slug),
      })),
    });
    score += Math.min(classes.length * W.sharedClass, W.classCap);
  }

  // --- live classes -------------------------------------------------------
  const theirLive = new Set(member.liveClasses.map((event) => event.id));
  const live = viewer.liveClasses
    .filter((event) => theirLive.has(event.id))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  if (live.length > 0) {
    groups.push({
      key: "live-classes",
      title: "Live classes you both signed up for",
      display: "list",
      entries: live.map((event) => ({
        key: `live:${event.id}`,
        label: event.title,
        href: liveClassHref(event.slug),
        date: event.startsAt,
      })),
    });
    score += Math.min(live.length * W.liveClass, W.liveClassCap);
  }

  // --- how they already connect -------------------------------------------
  const interactions = input.interactions;
  if (interactions && viewer.matchingOptIn && member.matchingOptIn) {
    const name = firstName(member.displayName);
    const entries: SimilarityEntry[] = [];
    if (interactions.viewerFollowsMember && interactions.memberFollowsViewer) {
      entries.push({ key: "follow-each-other", label: "You follow each other" });
      score += W.followEachOther;
    }
    if (interactions.sharedFolloweeCount > 0) {
      entries.push({ key: "shared-follows", label: sharedFollowLabel(interactions) });
      score += Math.min(interactions.sharedFolloweeCount * W.sharedFollowee, W.sharedFolloweeCap);
    }
    const theyReplied = interactions.memberRepliedToViewer > 0;
    const youReplied = interactions.viewerRepliedToMember > 0;
    if (theyReplied && youReplied) {
      entries.push({ key: "replies", label: "You've replied to each other's posts" });
      score += W.repliedBothWays;
    } else if (theyReplied) {
      entries.push({ key: "replies", label: `${name} has replied to your posts` });
      score += W.repliedOneWay;
    } else if (youReplied) {
      entries.push({ key: "replies", label: `You've replied to ${name}'s posts` });
      score += W.repliedOneWay;
    }
    const theyReacted = interactions.memberReactedToViewer > 0;
    const youReacted = interactions.viewerReactedToMember > 0;
    if (theyReacted && youReacted) {
      entries.push({ key: "reactions", label: "You've reacted to each other's posts" });
      score += W.reacted;
    } else if (theyReacted) {
      entries.push({ key: "reactions", label: `${name} has reacted to your posts` });
      score += W.reacted;
    } else if (youReacted) {
      entries.push({ key: "reactions", label: `You've reacted to ${name}'s posts` });
      score += W.reacted;
    }
    if (entries.length > 0) {
      groups.push({ key: "connections", title: "Already connected", display: "list", entries });
    }
  }

  const count = groups.reduce((total, group) => total + group.entries.length, 0);
  return { groups, count, score };
}

function sharedFollowLabel(interactions: InteractionFacts): string {
  const named = interactions.sharedFollowees.map((person) => person.displayName);
  const rest = interactions.sharedFolloweeCount - named.length;
  if (named.length === 0) {
    return interactions.sharedFolloweeCount === 1
      ? "You both follow the same member"
      : `You both follow ${interactions.sharedFolloweeCount} of the same members`;
  }
  if (rest <= 0) {
    if (named.length === 1) return `You both follow ${named[0]}`;
    return `You both follow ${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  }
  return `You both follow ${named.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

/**
 * One line for a member card, from the strongest things in common. Phrased
 * from the viewer's side, like the panel it summarises.
 */
export function similarityReason(similarity: Similarity): string | null {
  const phrases: string[] = [];
  const byKey = new Map(similarity.groups.map((group) => [group.key, group]));

  const interests = similarity.groups
    .filter((group) => group.display === "chips")
    .flatMap((group) => group.entries.map((entry) => entry.label));
  if (interests.length > 0) {
    const shown = interests.slice(0, 2);
    phrases.push(`You both picked ${shown.join(" and ")}${interests.length > 2 ? " and more" : ""}`);
  }
  const location = byKey.get("location")?.entries[0];
  if (location) phrases.push(location.label);
  const crew = byKey.get("crews")?.entries[0];
  if (crew) phrases.push(`You're both in ${crew.label}`);
  const roadmap = byKey.get("roadmap")?.entries[0];
  if (roadmap) phrases.push(roadmap.label);
  const cooking = byKey.get("cooking")?.entries[0];
  if (cooking) phrases.push(cooking.label);
  const course = byKey.get("classes")?.entries[0];
  if (course) phrases.push(`You've both taken ${course.label}`);
  const live = byKey.get("live-classes")?.entries[0];
  if (live) phrases.push(`You both signed up for ${live.label}`);
  const connection = byKey.get("connections")?.entries[0];
  if (connection) phrases.push(connection.label);

  if (phrases.length === 0) return null;
  const [first, second] = phrases;
  const sentence = second ? `${first}; ${lowerFirst(second)}` : first!;
  return `${sentence}.`;
}

function lowerFirst(text: string): string {
  // "You're both in Austin" reads as a clause after a semicolon; a name does not.
  return text.startsWith("You") ? `y${text.slice(1)}` : text;
}

/* ------------------------------------------------------------------------ */
/* Loading                                                                   */
/* ------------------------------------------------------------------------ */

const FACT_PROFILE_SELECT = {
  userId: true,
  displayName: true,
  privacy: true,
  directoryVisible: true,
  matchingOptIn: true,
  skill: true,
  glutenFree: true,
  city: true,
  region: true,
  country: true,
  user: { select: { status: true } },
} satisfies Prisma.ProfileSelect;

type FactProfile = Prisma.ProfileGetPayload<{ select: typeof FACT_PROFILE_SELECT }>;

/** Most rows of one kind read for one member. Plenty for a panel. */
const PER_MEMBER_CAP = 200;

function baseFacts(profile: FactProfile): SimilarityFacts {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    status: profile.user.status,
    privacy: readPrivacy(profile.privacy),
    directoryVisible: profile.directoryVisible,
    matchingOptIn: profile.matchingOptIn,
    skill: profile.skill,
    glutenFree: profile.glutenFree,
    city: profile.city,
    region: profile.region,
    country: profile.country,
    interests: [],
    roadmap: null,
    classes: [],
    liveClasses: [],
  };
}

/** Live classes the viewer may see, and never a draft. */
function liveClassWhere(viewer: EventViewer | null): Prisma.EventWhereInput {
  const visible = viewer ? (visibleEventsWhere(viewer) as Prisma.EventWhereInput) : { status: "PUBLISHED" as const };
  return { AND: [visible, { status: { not: "DRAFT" } }] };
}

/**
 * Full facts for a few members (the viewer and the member on a profile),
 * in one batch of queries whatever the number of members.
 */
export async function loadSimilarityFacts(
  userIds: string[],
  eventViewer: EventViewer | null,
): Promise<Map<string, SimilarityFacts>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();

  const [profiles, interests, roadmaps, classes, rsvps] = await Promise.all([
    prisma.profile.findMany({ where: { userId: { in: ids } }, select: FACT_PROFILE_SELECT }),
    prisma.profileInterest.findMany({
      where: { profile: { userId: { in: ids } } },
      select: {
        profile: { select: { userId: true } },
        interest: { select: { id: true, slug: true, label: true, kind: true, sortOrder: true } },
      },
      take: PER_MEMBER_CAP * ids.length,
    }),
    prisma.memberRoadmap.findMany({
      where: { userId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { userId: true, track: { select: { id: true, name: true } } },
    }),
    prisma.courseProgress.findMany({
      where: { userId: { in: ids }, course: { published: true } },
      orderBy: { updatedAt: "desc" },
      select: { userId: true, course: { select: { id: true, slug: true, title: true } } },
      take: PER_MEMBER_CAP * ids.length,
    }),
    prisma.eventRsvp.findMany({
      where: { userId: { in: ids }, status: "GOING", event: liveClassWhere(eventViewer) },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        event: { select: { id: true, slug: true, title: true, startsAt: true } },
      },
      take: PER_MEMBER_CAP * ids.length,
    }),
  ]);

  const facts = new Map(profiles.map((profile) => [profile.userId, baseFacts(profile)]));
  for (const row of [...interests].sort((a, b) => a.interest.sortOrder - b.interest.sortOrder)) {
    const fact = facts.get(row.profile.userId);
    if (fact) {
      const { id, slug, label, kind } = row.interest;
      fact.interests.push({ id, slug, label, kind });
    }
  }
  for (const row of roadmaps) {
    const fact = facts.get(row.userId);
    // One track at a time; the newest wins if an old row lingers.
    if (fact && !fact.roadmap) fact.roadmap = { trackId: row.track.id, name: row.track.name };
  }
  for (const row of classes) facts.get(row.userId)?.classes.push(row.course);
  for (const row of rsvps) facts.get(row.userId)?.liveClasses.push(row.event);
  return facts;
}

/** How the two have already met: follows, replies, reactions. */
export async function loadInteractions(
  viewerId: string,
  memberId: string,
  hiddenIds: Set<string>,
): Promise<InteractionFacts> {
  const [viewerFollowing, memberFollowing, mRepliedV, vRepliedM, mReactedV, vReactedM] =
    await Promise.all([
      prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true }, take: 2000 }),
      prisma.follow.findMany({ where: { followerId: memberId }, select: { followingId: true }, take: 2000 }),
      prisma.comment.count({ where: { authorId: memberId, post: { authorId: viewerId, status: "PUBLISHED" } } }),
      prisma.comment.count({ where: { authorId: viewerId, post: { authorId: memberId, status: "PUBLISHED" } } }),
      prisma.reaction.count({ where: { userId: memberId, post: { authorId: viewerId, status: "PUBLISHED" } } }),
      prisma.reaction.count({ where: { userId: viewerId, post: { authorId: memberId, status: "PUBLISHED" } } }),
    ]);

  const mine = new Set(viewerFollowing.map((row) => row.followingId));
  const theirs = new Set(memberFollowing.map((row) => row.followingId));
  const shared = [...theirs].filter(
    (id) => mine.has(id) && id !== viewerId && id !== memberId && !hiddenIds.has(id),
  );
  const named = shared.length
    ? await prisma.user.findMany({
        where: { id: { in: shared }, status: "ACTIVE" },
        orderBy: { handle: "asc" },
        take: 3,
        select: { handle: true, profile: { select: { displayName: true } } },
      })
    : [];

  return {
    viewerFollowsMember: mine.has(memberId),
    memberFollowsViewer: theirs.has(viewerId),
    sharedFollowees: named.map((row) => ({
      handle: row.handle,
      displayName: row.profile?.displayName ?? row.handle,
    })),
    sharedFolloweeCount: shared.length,
    memberRepliedToViewer: mRepliedV,
    viewerRepliedToMember: vRepliedM,
    memberReactedToViewer: mReactedV,
    viewerReactedToMember: vReactedM,
  };
}

/**
 * The panel on a member's profile, or null when there must be no panel.
 *
 * A fixed number of queries whatever either member has done, in three
 * parallel batches: who the viewer is (blocks, what they may see), both
 * members' facts with the crews they share, and — only when both allow it —
 * the interaction lines. Nothing is queried per interest, crew or class.
 */
export async function loadSimilarities(
  viewerId: string,
  memberId: string,
): Promise<Similarity | null> {
  if (viewerId === memberId) return null;
  const [blocked, eventViewer, visibility] = await Promise.all([
    getBlockedUserIds(viewerId),
    getEventViewer(viewerId),
    getMemberVisibility(viewerId),
  ]);
  if (blocked.has(memberId)) return null;

  const [facts, crews] = await Promise.all([
    loadSimilarityFacts([viewerId, memberId], eventViewer),
    // The crews package's own answer (C6): crews both belong to, archived
    // crews left out.
    sharedCrews(viewerId, memberId),
  ]);
  const viewer = facts.get(viewerId);
  const member = facts.get(memberId);
  if (!viewer || !member) return null;
  if (!similarityAllowed({ viewer, member, blocked: false })) return null;

  const interactions =
    viewer.matchingOptIn && member.matchingOptIn
      ? await loadInteractions(viewerId, memberId, visibility.hiddenIds)
      : null;

  return computeSimilarities({ viewer, member, sharedCrews: crews, interactions });
}

export type RankedSimilar = {
  userId: string;
  score: number;
  reason: string;
  similarity: Similarity;
};

/** How many candidates one ranking will consider. */
const CANDIDATE_CAP = 1500;
/** Rows read per overlap query. */
const OVERLAP_CAP = 5000;

/**
 * "Similar to you": the members with the most in common with the viewer,
 * ranked by the same computation as the profile panel.
 *
 * Candidates are found from overlaps (an interest, a crew, a class, a live
 * class, the same track, the same city, a follow or a reply), one grouped
 * query per kind rather than one per member, then scored together. Members
 * who left the directory, switched matching off, or share a block with the
 * viewer are never candidates.
 */
export async function rankSimilarMembers(
  viewerId: string,
  limit: number,
): Promise<RankedSimilar[]> {
  const [eventViewer, blocked, visibility, viewerCrews] = await Promise.all([
    getEventViewer(viewerId),
    getBlockedUserIds(viewerId),
    getMemberVisibility(viewerId),
    listCrewsForUser(viewerId),
  ]);
  const viewer = (await loadSimilarityFacts([viewerId], eventViewer)).get(viewerId);
  if (!viewer || viewer.status !== "ACTIVE") return [];

  const excluded = [viewerId, ...blocked];
  const candidateProfile: Prisma.ProfileWhereInput = {
    directoryVisible: true,
    matchingOptIn: true,
    user: { status: "ACTIVE" },
    userId: { notIn: excluded },
  };
  const notExcluded = { notIn: excluded };
  const interestIds = viewer.interests.map((interest) => interest.id);
  const crewIds = viewerCrews.map((crew) => crew.id);
  const classIds = viewer.classes.map((course) => course.id);
  const liveIds = viewer.liveClasses.map((event) => event.id);
  const interact = viewer.matchingOptIn;

  const [
    interestRows,
    crewRows,
    classRows,
    liveRows,
    trackRows,
    cityRows,
    viewerFollowing,
    followersOfViewer,
    repliesToViewer,
    viewerReplies,
    reactionsToViewer,
    viewerReactions,
  ] = await Promise.all([
    interestIds.length
      ? prisma.profileInterest.findMany({
          where: { interestId: { in: interestIds }, profile: candidateProfile },
          select: { interestId: true, profile: { select: { userId: true } } },
          take: OVERLAP_CAP,
        })
      : [],
    crewIds.length
      ? prisma.crewMember.findMany({
          where: { crewId: { in: crewIds }, userId: notExcluded },
          select: { crewId: true, userId: true },
          take: OVERLAP_CAP,
        })
      : [],
    classIds.length
      ? prisma.courseProgress.findMany({
          where: { courseId: { in: classIds }, userId: notExcluded },
          select: { courseId: true, userId: true },
          take: OVERLAP_CAP,
        })
      : [],
    liveIds.length
      ? prisma.eventRsvp.findMany({
          where: { eventId: { in: liveIds }, status: "GOING", userId: notExcluded },
          select: { eventId: true, userId: true },
          take: OVERLAP_CAP,
        })
      : [],
    viewer.roadmap
      ? prisma.memberRoadmap.findMany({
          where: { trackId: viewer.roadmap.trackId, userId: notExcluded },
          select: { userId: true },
          take: OVERLAP_CAP,
        })
      : [],
    viewer.city?.trim()
      ? prisma.profile.findMany({
          where: { ...candidateProfile, city: { equals: viewer.city.trim(), mode: "insensitive" } },
          select: { userId: true },
          take: OVERLAP_CAP,
        })
      : [],
    interact
      ? prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true }, take: 2000 })
      : [],
    interact
      ? prisma.follow.findMany({
          where: { followingId: viewerId, followerId: notExcluded },
          select: { followerId: true },
          take: OVERLAP_CAP,
        })
      : [],
    interact
      ? prisma.comment.findMany({
          where: { authorId: notExcluded, post: { authorId: viewerId, status: "PUBLISHED" } },
          select: { authorId: true },
          take: OVERLAP_CAP,
        })
      : [],
    interact
      ? prisma.comment.findMany({
          where: { authorId: viewerId, post: { authorId: notExcluded, status: "PUBLISHED" } },
          select: { post: { select: { authorId: true } } },
          take: OVERLAP_CAP,
        })
      : [],
    interact
      ? prisma.reaction.findMany({
          where: { userId: notExcluded, post: { authorId: viewerId, status: "PUBLISHED" } },
          select: { userId: true },
          take: OVERLAP_CAP,
        })
      : [],
    interact
      ? prisma.reaction.findMany({
          where: { userId: viewerId, post: { authorId: notExcluded, status: "PUBLISHED" } },
          select: { post: { select: { authorId: true } } },
          take: OVERLAP_CAP,
        })
      : [],
  ]);

  const viewerFollowingIds = new Set(viewerFollowing.map((row) => row.followingId));
  const followeeIds = [...viewerFollowingIds].filter((id) => !visibility.hiddenIds.has(id));
  const sharedFollowRows =
    interact && followeeIds.length
      ? await prisma.follow.findMany({
          where: { followingId: { in: followeeIds }, followerId: notExcluded },
          select: { followerId: true, followingId: true },
          take: OVERLAP_CAP,
        })
      : [];

  // Everyone with at least one overlap, before the per-member checks.
  const candidateIds = new Set<string>();
  const add = (id: string) => {
    if (id !== viewerId && !blocked.has(id) && candidateIds.size < CANDIDATE_CAP) candidateIds.add(id);
  };
  interestRows.forEach((row) => add(row.profile.userId));
  crewRows.forEach((row) => add(row.userId));
  classRows.forEach((row) => add(row.userId));
  liveRows.forEach((row) => add(row.userId));
  trackRows.forEach((row) => add(row.userId));
  cityRows.forEach((row) => add(row.userId));
  [...viewerFollowingIds].forEach(add);
  followersOfViewer.forEach((row) => add(row.followerId));
  repliesToViewer.forEach((row) => add(row.authorId));
  viewerReplies.forEach((row) => add(row.post.authorId));
  reactionsToViewer.forEach((row) => add(row.userId));
  viewerReactions.forEach((row) => {
    if (row.post) add(row.post.authorId);
  });
  sharedFollowRows.forEach((row) => add(row.followerId));
  if (candidateIds.size === 0) return [];

  const profiles = await prisma.profile.findMany({
    where: { ...candidateProfile, userId: { in: [...candidateIds] } },
    select: FACT_PROFILE_SELECT,
  });

  const groupIds = <T>(rows: T[], user: (row: T) => string, item: (row: T) => string) => {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const id = user(row);
      const set = map.get(id) ?? new Set<string>();
      set.add(item(row));
      map.set(id, set);
    }
    return map;
  };
  const countBy = <T>(rows: T[], user: (row: T) => string) => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(user(row), (map.get(user(row)) ?? 0) + 1);
    return map;
  };

  const interestsBy = groupIds(interestRows, (row) => row.profile.userId, (row) => row.interestId);
  const crewsBy = groupIds(crewRows, (row) => row.userId, (row) => row.crewId);
  const classesBy = groupIds(classRows, (row) => row.userId, (row) => row.courseId);
  const liveBy = groupIds(liveRows, (row) => row.userId, (row) => row.eventId);
  const onTrack = new Set(trackRows.map((row) => row.userId));
  const followsViewer = new Set(followersOfViewer.map((row) => row.followerId));
  const sharedFollowsBy = countBy(sharedFollowRows, (row) => row.followerId);
  const repliedToViewer = countBy(repliesToViewer, (row) => row.authorId);
  const viewerRepliedTo = countBy(viewerReplies, (row) => row.post.authorId);
  const reactedToViewer = countBy(reactionsToViewer, (row) => row.userId);
  const viewerReactedTo = countBy(
    viewerReactions.flatMap((row) => (row.post ? [row.post] : [])),
    (post) => post.authorId,
  );

  const ranked: RankedSimilar[] = [];
  for (const profile of profiles) {
    const id = profile.userId;
    const member = baseFacts(profile);
    const theirInterests = interestsBy.get(id);
    member.interests = viewer.interests.filter((interest) => theirInterests?.has(interest.id));
    const theirClasses = classesBy.get(id);
    member.classes = viewer.classes.filter((course) => theirClasses?.has(course.id));
    const theirLive = liveBy.get(id);
    member.liveClasses = viewer.liveClasses.filter((event) => theirLive?.has(event.id));
    member.roadmap = onTrack.has(id) ? viewer.roadmap : null;
    const theirCrews = crewsBy.get(id);

    const similarity = computeSimilarities({
      viewer,
      member,
      sharedCrews: viewerCrews.filter((crew) => theirCrews?.has(crew.id)),
      interactions: interact
        ? {
            viewerFollowsMember: viewerFollowingIds.has(id),
            memberFollowsViewer: followsViewer.has(id),
            sharedFollowees: [],
            sharedFolloweeCount: sharedFollowsBy.get(id) ?? 0,
            memberRepliedToViewer: repliedToViewer.get(id) ?? 0,
            viewerRepliedToMember: viewerRepliedTo.get(id) ?? 0,
            memberReactedToViewer: reactedToViewer.get(id) ?? 0,
            viewerReactedToMember: viewerReactedTo.get(id) ?? 0,
          }
        : null,
    });
    if (similarity.count === 0) continue;
    ranked.push({
      userId: id,
      score: similarity.score,
      reason: similarityReason(similarity) ?? "You have things in common.",
      similarity,
    });
  }

  const names = new Map(profiles.map((profile) => [profile.userId, profile.displayName]));
  return ranked
    .sort(
      (a, b) =>
        b.score - a.score ||
        (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? "") ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, Math.max(0, limit));
}
