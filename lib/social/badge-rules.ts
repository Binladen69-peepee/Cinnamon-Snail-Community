/**
 * Badges: what they are for, and the rules that award them.
 *
 * The client asked how badges could best drive engagement. The answer this
 * file encodes is four rules, each of which the previous catalogue broke:
 *
 * 1. **Every badge is a count of something a member really did**, read from
 *    the rows that record it. No badge is a login, a page view or a number of
 *    points, and none can be bought with activity nobody else sees.
 * 2. **Badges come in short ladders.** Twelve families, most with three tiers
 *    (first, regular, mainstay), so there is always a next step in sight and
 *    the first rung is reachable in a week. A ladder rewards coming back
 *    without punishing anyone for a quiet month: nothing expires, nothing is
 *    a streak, and pace is the member's own (DEC-080).
 * 3. **Progress is shown to the member, never ranked against others.** The
 *    owner of a profile sees "3 of 5 replies" on the next rung of every
 *    ladder; visitors see only what was earned, with the date. There is no
 *    leaderboard and no score.
 * 4. **The helpful things count most.** Replies on other members' posts,
 *    answers that someone found useful, and ideas the team decided to make are
 *    their own ladders, because those are what make a community worth joining.
 *
 * Definitions live here, in code, so they are reviewable in a diff; the
 * `Badge` table mirrors them (`syncBadgeCatalog`). Awarding is idempotent on
 * the `(badgeId, userId)` unique key, and an earned badge is never taken back:
 * a member who restarts a roadmap or deletes a post keeps what they earned.
 *
 * Two badges were retired rather than fixed, because no honest signal exists
 * for them: `gluten-free-wizard` (recipes carry no gluten-free tag, so it
 * could never be earned) and `milestone-streak` (a weekly streak contradicts
 * member-set pacing of one to four weeks per topic; the roadmap ladder
 * replaces it). Their rows stay, and anyone who holds one keeps it on their
 * profile as a legacy award. `question-answered`, `kitchen-helper`,
 * `connector`, `track-complete` and `one-year-in` keep their slugs (and every
 * award already made) with criteria that now read real data.
 */

/** Everything the rules read about one member. Each is a count of real rows. */
export type MemberActivity = {
  /** Published cooks: RECIPE, IMAGE or VIDEO posts. */
  recipesShared: number;
  /** Comments on published posts written by other members. */
  repliesToOthers: number;
  /**
   * Replies to another member's QUESTION post that someone other than the
   * author reacted to or upvoted.
   */
  helpfulAnswers: number;
  /** Classes (courses) finished: every published lesson complete. */
  coursesCompleted: number;
  /** Roadmap topics completed. A skipped topic is never counted. */
  roadmapTopicsCompleted: number;
  /**
   * Live classes the member RSVP'd "going" to that have taken place. There is
   * no attendance record, so this is the honest proxy, and it says so.
   */
  liveClassesAttended: number;
  /** The member's ideas that the team moved to Planned or Done. */
  ideasPlanned: number;
  /** Recipe variations approved by a reviewer. */
  recipeVariations: number;
  /** Community challenges finished. */
  challengesFinished: number;
  /** Members they have had a two-way direct conversation with. */
  connectionsMade: number;
  /** Testimonials written for places on the Bulletin Board map. */
  placesReviewed: number;
  /** Days since the member's original SamCart start, or since they joined. */
  memberSinceDays: number;
};

export type BadgeFamilyKey =
  | "cooks"
  | "replies"
  | "answers"
  | "classes"
  | "roadmap"
  | "live"
  | "ideas"
  | "variations"
  | "challenges"
  | "conversations"
  | "places"
  | "tenure";

export type BadgeFamily = {
  key: BadgeFamilyKey;
  /** The ladder's name, shown above its progress. */
  label: string;
  /** Why this ladder exists, in one line. Shown to the member. */
  purpose: string;
  /** What one step of the measure is called: [singular, plural]. */
  unit: readonly [string, string];
  measure: (activity: MemberActivity) => number;
};

export type BadgeRule = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  criteria: string;
  sortOrder: number;
  family: BadgeFamilyKey;
  /** 1-based position on the family's ladder. */
  tier: number;
  /** The family measure at which this badge is earned. */
  threshold: number;
  earned: (activity: MemberActivity) => boolean;
  reason: (activity: MemberActivity) => string;
};

/** A badge that is no longer awarded. Its row and every award are kept. */
export type RetiredBadge = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  criteria: string;
  sortOrder: number;
  retiredBecause: string;
};

const DAYS_PER_YEAR = 365;

export const BADGE_FAMILIES: readonly BadgeFamily[] = [
  {
    key: "cooks",
    label: "Cooks shared",
    purpose: "Showing what you made is what gets everyone else cooking.",
    unit: ["cook", "cooks"],
    measure: (a) => a.recipesShared,
  },
  {
    key: "replies",
    label: "Replies to members",
    purpose: "Answering someone else's post is how a room becomes a community.",
    unit: ["reply", "replies"],
    measure: (a) => a.repliesToOthers,
  },
  {
    key: "answers",
    label: "Helpful answers",
    purpose: "Answers to a member's question that someone found useful.",
    unit: ["helpful answer", "helpful answers"],
    measure: (a) => a.helpfulAnswers,
  },
  {
    key: "classes",
    label: "Classes finished",
    purpose: "Every lesson of a class, start to end.",
    unit: ["class", "classes"],
    measure: (a) => a.coursesCompleted,
  },
  {
    key: "roadmap",
    label: "Roadmap topics",
    purpose: "Topics finished on your learning roadmap, at the pace you set.",
    unit: ["topic", "topics"],
    measure: (a) => a.roadmapTopicsCompleted,
  },
  {
    key: "live",
    label: "Live classes",
    purpose: "Live classes you RSVP'd to that went ahead.",
    unit: ["live class", "live classes"],
    measure: (a) => a.liveClassesAttended,
  },
  {
    key: "ideas",
    label: "Ideas planned",
    purpose: "Ideas you suggested that the team decided to make.",
    unit: ["idea", "ideas"],
    measure: (a) => a.ideasPlanned,
  },
  {
    key: "variations",
    label: "Recipe variations",
    purpose: "Your take on a recipe, reviewed and listed for everyone.",
    unit: ["variation", "variations"],
    measure: (a) => a.recipeVariations,
  },
  {
    key: "challenges",
    label: "Challenges",
    purpose: "Seasonal challenges you saw through to the end.",
    unit: ["challenge", "challenges"],
    measure: (a) => a.challengesFinished,
  },
  {
    key: "conversations",
    label: "Conversations",
    purpose: "Members you have actually talked with, both ways.",
    unit: ["member", "members"],
    measure: (a) => a.connectionsMade,
  },
  {
    key: "places",
    label: "Local places",
    purpose: "Vegan places you vouched for on the Bulletin Board.",
    unit: ["place", "places"],
    measure: (a) => a.placesReviewed,
  },
  {
    key: "tenure",
    label: "Membership",
    purpose: "Years since you first joined Vegan University.",
    unit: ["year", "years"],
    measure: (a) => Math.floor(Math.max(0, a.memberSinceDays) / DAYS_PER_YEAR),
  },
];

const FAMILY_BY_KEY = new Map(BADGE_FAMILIES.map((family) => [family.key, family]));
const FAMILY_ORDER = new Map(BADGE_FAMILIES.map((family, index) => [family.key, index]));

export function badgeFamily(key: BadgeFamilyKey): BadgeFamily {
  return FAMILY_BY_KEY.get(key)!;
}

/** "1 reply", "3 replies". */
export function countWithUnit(family: BadgeFamily, count: number): string {
  return `${count} ${count === 1 ? family.unit[0] : family.unit[1]}`;
}

type TierSpec = {
  family: BadgeFamilyKey;
  slug: string;
  name: string;
  icon: string;
  threshold: number;
  description: string;
  criteria: string;
  reason: (count: number) => string;
};

/**
 * The ladders. Order within a family is the order of the tiers; slugs that
 * existed before (first-cook, ten-plates, kitchen-helper, question-answered,
 * track-complete, recipe-remixer, challenge-finisher, connector, local-guide,
 * one-year-in) keep their slugs so every award already made still counts.
 */
const TIERS: TierSpec[] = [
  // --- cooks shared -----------------------------------------------------
  {
    family: "cooks",
    slug: "first-cook",
    name: "First Cook",
    icon: "🍳",
    threshold: 1,
    description: "Shared the first thing you cooked here.",
    criteria: "Share a recipe, or a photo or video of something you cooked.",
    reason: () => "Shared a first cook with the community.",
  },
  {
    family: "cooks",
    slug: "ten-plates",
    name: "Ten Plates",
    icon: "🍽️",
    threshold: 10,
    description: "Ten dishes shared with the kitchen.",
    criteria: "Share ten cooks: recipes, photos or videos of your food.",
    reason: (n) => `Shared ${n} cooks with the community.`,
  },
  {
    family: "cooks",
    slug: "twenty-five-plates",
    name: "Twenty-Five Plates",
    icon: "🥘",
    threshold: 25,
    description: "Twenty-five dishes in, and still cooking.",
    criteria: "Share twenty-five cooks.",
    reason: (n) => `Shared ${n} cooks with the community.`,
  },

  // --- replies to other members -----------------------------------------
  {
    family: "replies",
    slug: "good-neighbor",
    name: "Good Neighbor",
    icon: "👋",
    threshold: 5,
    description: "Joined five conversations that weren't your own.",
    criteria: "Leave five replies on other members' posts.",
    reason: (n) => `Left ${n} replies on other members' posts.`,
  },
  {
    family: "replies",
    slug: "kitchen-helper",
    name: "Kitchen Helper",
    icon: "🤝",
    threshold: 25,
    description: "Showed up in other people's threads.",
    criteria: "Leave twenty-five replies on other members' posts.",
    reason: (n) => `Left ${n} replies on other members' posts.`,
  },
  {
    family: "replies",
    slug: "heart-of-the-table",
    name: "Heart of the Table",
    icon: "❤️",
    threshold: 100,
    description: "A hundred replies that kept other members' threads going.",
    criteria: "Leave a hundred replies on other members' posts.",
    reason: (n) => `Left ${n} replies on other members' posts.`,
  },

  // --- helpful answers ----------------------------------------------------
  {
    family: "answers",
    slug: "question-answered",
    name: "Question Answered",
    icon: "💡",
    threshold: 1,
    description: "Answered a question someone needed answered.",
    criteria:
      "Answer another member's question, and have someone react to or upvote your answer.",
    reason: () => "Answered a member's question, and it helped.",
  },
  {
    family: "answers",
    slug: "go-to-cook",
    name: "Go-To Cook",
    icon: "🧑‍🍳",
    threshold: 5,
    description: "Five answers other members found helpful.",
    criteria: "Give five answers to members' questions that someone reacted to or upvoted.",
    reason: (n) => `Gave ${n} answers that members found helpful.`,
  },
  {
    family: "answers",
    slug: "kitchen-mentor",
    name: "Kitchen Mentor",
    icon: "🌟",
    threshold: 20,
    description: "Twenty helpful answers. People ask for you by name.",
    criteria: "Give twenty answers to members' questions that someone reacted to or upvoted.",
    reason: (n) => `Gave ${n} answers that members found helpful.`,
  },

  // --- classes finished ---------------------------------------------------
  {
    family: "classes",
    slug: "track-complete",
    name: "Class Complete",
    icon: "🎓",
    threshold: 1,
    description: "Finished a whole class, start to end.",
    criteria: "Complete every lesson in a class.",
    reason: (n) => (n === 1 ? "Finished a class end to end." : `Finished ${n} classes.`),
  },
  {
    family: "classes",
    slug: "honor-roll",
    name: "Honor Roll",
    icon: "📚",
    threshold: 3,
    description: "Three classes finished.",
    criteria: "Complete every lesson in three classes.",
    reason: (n) => `Finished ${n} classes.`,
  },
  {
    family: "classes",
    slug: "deans-list",
    name: "Dean's List",
    icon: "🏅",
    threshold: 10,
    description: "Ten classes, start to finish.",
    criteria: "Complete every lesson in ten classes.",
    reason: (n) => `Finished ${n} classes.`,
  },

  // --- roadmap topics -----------------------------------------------------
  {
    family: "roadmap",
    slug: "on-the-map",
    name: "On the Map",
    icon: "🗺️",
    threshold: 1,
    description: "Finished the first topic on your roadmap.",
    criteria: "Complete a topic on your learning roadmap. Skipped topics don't count.",
    reason: () => "Finished a first roadmap topic.",
  },
  {
    family: "roadmap",
    slug: "steady-pace",
    name: "Steady Pace",
    icon: "🧭",
    threshold: 5,
    description: "Five roadmap topics done, at your own pace.",
    criteria: "Complete five topics on your learning roadmap.",
    reason: (n) => `Finished ${n} roadmap topics.`,
  },
  {
    family: "roadmap",
    slug: "trailblazer",
    name: "Trailblazer",
    icon: "🏔️",
    threshold: 10,
    description: "Ten roadmap topics done.",
    criteria: "Complete ten topics on your learning roadmap.",
    reason: (n) => `Finished ${n} roadmap topics.`,
  },

  // --- live classes -------------------------------------------------------
  {
    family: "live",
    slug: "first-live-class",
    name: "First Live Class",
    icon: "🎥",
    threshold: 1,
    description: "Pulled up a chair for a live class.",
    criteria: "RSVP to a live class. It counts once the class has taken place.",
    reason: () => "RSVP'd to a first live class.",
  },
  {
    family: "live",
    slug: "live-class-regular",
    name: "Live Class Regular",
    icon: "📅",
    threshold: 5,
    description: "Five live classes on the calendar and done.",
    criteria: "RSVP to five live classes that take place.",
    reason: (n) => `RSVP'd to ${n} live classes.`,
  },
  {
    family: "live",
    slug: "front-row",
    name: "Front Row",
    icon: "🎟️",
    threshold: 12,
    description: "A year's worth of live classes.",
    criteria: "RSVP to twelve live classes that take place.",
    reason: (n) => `RSVP'd to ${n} live classes.`,
  },

  // --- ideas planned ------------------------------------------------------
  {
    family: "ideas",
    slug: "bright-idea",
    name: "Bright Idea",
    icon: "✨",
    threshold: 1,
    description: "An idea you suggested made it onto the plan.",
    criteria: "Suggest an idea on Ideas & Requests that the team marks Planned or Done.",
    reason: () => "Suggested an idea the team decided to make.",
  },
  {
    family: "ideas",
    slug: "visionary",
    name: "Visionary",
    icon: "🔭",
    threshold: 3,
    description: "Three of your ideas made it onto the plan.",
    criteria: "Have three of your ideas marked Planned or Done.",
    reason: (n) => `Suggested ${n} ideas the team decided to make.`,
  },

  // --- recipe variations --------------------------------------------------
  {
    family: "variations",
    slug: "first-remix",
    name: "First Remix",
    icon: "🔁",
    threshold: 1,
    description: "Your first take on a recipe, reviewed and listed.",
    criteria: "Have a recipe variation approved.",
    reason: () => "Published a first recipe variation.",
  },
  {
    family: "variations",
    slug: "recipe-remixer",
    name: "Recipe Remixer",
    icon: "🔀",
    threshold: 3,
    description: "Turned someone else's recipe into your own.",
    criteria: "Have three recipe variations approved.",
    reason: (n) => `Published ${n} recipe variations.`,
  },
  {
    family: "variations",
    slug: "test-kitchen",
    name: "Test Kitchen",
    icon: "🧪",
    threshold: 10,
    description: "Ten variations other cooks can try.",
    criteria: "Have ten recipe variations approved.",
    reason: (n) => `Published ${n} recipe variations.`,
  },

  // --- challenges ---------------------------------------------------------
  {
    family: "challenges",
    slug: "challenge-finisher",
    name: "Challenge Finisher",
    icon: "🏁",
    threshold: 1,
    description: "Finished what you started.",
    criteria: "Complete a community challenge.",
    reason: () => "Finished a community challenge.",
  },
  {
    family: "challenges",
    slug: "season-ticket",
    name: "Season Ticket",
    icon: "🗓️",
    threshold: 3,
    description: "Three community challenges seen through.",
    criteria: "Complete three community challenges.",
    reason: (n) => `Finished ${n} community challenges.`,
  },

  // --- conversations ------------------------------------------------------
  {
    family: "conversations",
    slug: "connector",
    name: "Connector",
    icon: "💬",
    threshold: 5,
    description: "Introduced yourself and meant it.",
    criteria: "Have a direct conversation with five members, where you both wrote.",
    reason: (n) => `Had conversations with ${n} members.`,
  },

  // --- local places -------------------------------------------------------
  {
    family: "places",
    slug: "local-guide",
    name: "Local Guide",
    icon: "📍",
    threshold: 3,
    description: "Pointed members to good food near you.",
    criteria: "Write three place testimonials on the Bulletin Board.",
    reason: (n) => `Vouched for ${n} local places.`,
  },

  // --- membership ---------------------------------------------------------
  {
    family: "tenure",
    slug: "one-year-in",
    name: "One Year In",
    icon: "🌱",
    threshold: 1,
    description: "A year of cooking with this community.",
    criteria: "Be a member for a year, counted from when you first subscribed.",
    reason: () => "One year with Vegan University.",
  },
  {
    family: "tenure",
    slug: "two-years-in",
    name: "Two Years In",
    icon: "🌿",
    threshold: 2,
    description: "Two years of cooking with this community.",
    criteria: "Be a member for two years.",
    reason: () => "Two years with Vegan University.",
  },
  {
    family: "tenure",
    slug: "five-years-in",
    name: "Five Years In",
    icon: "🌳",
    threshold: 5,
    description: "Five years at the table.",
    criteria: "Be a member for five years.",
    reason: () => "Five years with Vegan University.",
  },
];

function buildRules(): BadgeRule[] {
  const tierInFamily = new Map<BadgeFamilyKey, number>();
  return TIERS.map((spec) => {
    const family = badgeFamily(spec.family);
    const tier = (tierInFamily.get(spec.family) ?? 0) + 1;
    tierInFamily.set(spec.family, tier);
    const order = FAMILY_ORDER.get(spec.family) ?? 0;
    return {
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      icon: spec.icon,
      criteria: spec.criteria,
      // Families in their order, tiers inside them, with room between.
      sortOrder: (order + 1) * 100 + tier * 10,
      family: spec.family,
      tier,
      threshold: spec.threshold,
      earned: (activity) => family.measure(activity) >= spec.threshold,
      reason: (activity) => spec.reason(family.measure(activity)),
    };
  });
}

/** Every badge that can be earned, families in order, tiers within them. */
export const BADGE_RULES: BadgeRule[] = buildRules();

/** No longer awarded. Kept so the rows, and anyone's award, survive. */
export const RETIRED_BADGES: RetiredBadge[] = [
  {
    slug: "gluten-free-wizard",
    name: "Gluten-Free Wizard",
    description: "Made gluten-free cooking look easy.",
    icon: "🌾",
    criteria: "Retired: no longer awarded.",
    sortOrder: 9010,
    retiredBecause:
      "Recipes carry no gluten-free tag, so there was never a way to count gluten-free cooks.",
  },
  {
    slug: "milestone-streak",
    name: "Milestone Streak",
    description: "Kept a roadmap streak going.",
    icon: "🔥",
    criteria: "Retired: no longer awarded.",
    sortOrder: 9020,
    retiredBecause:
      "A weekly streak fights member-set pacing; roadmap topic badges replaced it.",
  },
];

const RULE_BY_SLUG = new Map(BADGE_RULES.map((rule) => [rule.slug, rule]));
const RETIRED_SLUGS = new Set(RETIRED_BADGES.map((badge) => badge.slug));

export function ruleForSlug(slug: string): BadgeRule | null {
  return RULE_BY_SLUG.get(slug) ?? null;
}

export function isRetiredBadge(slug: string): boolean {
  return RETIRED_SLUGS.has(slug);
}

/** The ladder a family climbs, in tier order. */
export function familyTiers(key: BadgeFamilyKey): BadgeRule[] {
  return BADGE_RULES.filter((rule) => rule.family === key);
}

export function earnedBadges(activity: MemberActivity): BadgeRule[] {
  return BADGE_RULES.filter((rule) => rule.earned(activity));
}

export function newlyEarned(
  activity: MemberActivity,
  alreadyHeld: string[],
): BadgeRule[] {
  const held = new Set(alreadyHeld);
  return earnedBadges(activity).filter((rule) => !held.has(rule.slug));
}

/* ------------------------------------------------------------------------ */
/* What a profile shows                                                      */
/* ------------------------------------------------------------------------ */

/** One badge a member holds, as the profile shows it. */
export type EarnedBadgeView = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** Why it was awarded, in the member's own numbers. */
  reason: string | null;
  awardedAt: Date;
  family: BadgeFamilyKey | null;
  familyLabel: string | null;
  tier: number | null;
  /** How many tiers the family has. */
  tiers: number | null;
  /** Retired, or not in the catalogue at all. Shown, never re-awarded. */
  legacy: boolean;
};

/** The next rung of one ladder, with how far along the member is. */
export type BadgeProgressView = {
  slug: string;
  name: string;
  icon: string;
  criteria: string;
  family: BadgeFamilyKey;
  familyLabel: string;
  purpose: string;
  tier: number;
  tiers: number;
  current: number;
  target: number;
  /** "3 of 5 replies". */
  progressLabel: string;
};

export type BadgeShowcase = {
  /** Newest first. */
  earned: EarnedBadgeView[];
  /** The owner only: the next rung of every ladder already started. */
  inProgress: BadgeProgressView[];
  /** The owner only: ladders not started yet, at their first rung. */
  toStart: BadgeProgressView[];
  /** Badges that can be earned at all. */
  available: number;
};

export type HeldBadge = {
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  reason: string | null;
  awardedAt: Date;
};

/**
 * The badges section of a profile, from what is held and (for the owner)
 * what they have done.
 *
 * Visitors get `activity: null`, so they see what was earned and nothing
 * about what was not: progress is the member's own business.
 */
export function buildBadgeShowcase(input: {
  held: HeldBadge[];
  activity: MemberActivity | null;
}): BadgeShowcase {
  const heldSlugs = new Set(input.held.map((row) => row.slug));

  const earned: EarnedBadgeView[] = [...input.held]
    .sort((a, b) => b.awardedAt.getTime() - a.awardedAt.getTime())
    .map((row) => {
      const rule = ruleForSlug(row.slug);
      const family = rule ? badgeFamily(rule.family) : null;
      return {
        slug: row.slug,
        name: rule?.name ?? row.name,
        description: rule?.description ?? row.description,
        icon: rule?.icon ?? row.icon ?? "★",
        reason: row.reason,
        awardedAt: row.awardedAt,
        family: rule?.family ?? null,
        familyLabel: family?.label ?? null,
        tier: rule?.tier ?? null,
        tiers: rule ? familyTiers(rule.family).length : null,
        legacy: !rule,
      };
    });

  const inProgress: BadgeProgressView[] = [];
  const toStart: BadgeProgressView[] = [];
  if (input.activity) {
    for (const family of BADGE_FAMILIES) {
      const ladder = familyTiers(family.key);
      const next = ladder.find((rule) => !heldSlugs.has(rule.slug));
      if (!next) continue;
      const current = Math.max(0, family.measure(input.activity));
      const view: BadgeProgressView = {
        slug: next.slug,
        name: next.name,
        icon: next.icon,
        criteria: next.criteria,
        family: family.key,
        familyLabel: family.label,
        purpose: family.purpose,
        tier: next.tier,
        tiers: ladder.length,
        current: Math.min(current, next.threshold),
        target: next.threshold,
        progressLabel: `${Math.min(current, next.threshold)} of ${countWithUnit(family, next.threshold)}`,
      };
      // A ladder with an earlier rung already held is under way even if this
      // rung's count is still zero (tenure, say).
      const started = current > 0 || next.tier > 1;
      (started ? inProgress : toStart).push(view);
    }
    // Closest to done first, so the next win is at the top.
    inProgress.sort(
      (a, b) =>
        b.current / b.target - a.current / a.target ||
        (FAMILY_ORDER.get(a.family) ?? 0) - (FAMILY_ORDER.get(b.family) ?? 0),
    );
  }

  return { earned, inProgress, toStart, available: BADGE_RULES.length };
}
