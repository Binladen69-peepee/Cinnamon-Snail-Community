/**
 * Recognition criteria from BUILD.md §12.4. No points, no leaderboard — each
 * badge is a specific thing a member actually did.
 */
export type MemberActivity = {
  recipesShared: number;
  recipeVariations: number;
  lessonsCompleted: number;
  coursesCompleted: number;
  answersAccepted: number;
  commentsWritten: number;
  challengesFinished: number;
  glutenFreeRecipes: number;
  milestoneStreakWeeks: number;
  connectionsMade: number;
  placesReviewed: number;
  memberSinceDays: number;
};

export type BadgeRule = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  criteria: string;
  sortOrder: number;
  earned: (activity: MemberActivity) => boolean;
  reason: (activity: MemberActivity) => string;
};

export const BADGE_RULES: BadgeRule[] = [
  {
    slug: "first-cook",
    name: "First Cook",
    description: "Shared the first thing you cooked here.",
    icon: "🍳",
    criteria: "Share one recipe or cook post.",
    sortOrder: 10,
    earned: (a) => a.recipesShared >= 1,
    reason: () => "Shared a first cook with the community.",
  },
  {
    slug: "ten-plates",
    name: "Ten Plates",
    description: "Ten dishes shared with the kitchen.",
    icon: "🍽️",
    criteria: "Share ten recipes or cook posts.",
    sortOrder: 20,
    earned: (a) => a.recipesShared >= 10,
    reason: (a) => `Shared ${a.recipesShared} plates with the community.`,
  },
  {
    slug: "kitchen-helper",
    name: "Kitchen Helper",
    description: "Showed up in other people's threads.",
    icon: "🤝",
    criteria: "Write twenty-five comments.",
    sortOrder: 30,
    earned: (a) => a.commentsWritten >= 25,
    reason: (a) => `Left ${a.commentsWritten} helpful comments.`,
  },
  {
    slug: "question-answered",
    name: "Question Answered",
    description: "Answered a question someone needed answered.",
    icon: "💡",
    criteria: "Have an answer accepted by the asker.",
    sortOrder: 40,
    earned: (a) => a.answersAccepted >= 1,
    reason: () => "Answered a member's question.",
  },
  {
    slug: "milestone-streak",
    name: "Milestone Streak",
    description: "Kept a roadmap streak going.",
    icon: "🔥",
    criteria: "Hit roadmap milestones four weeks running.",
    sortOrder: 50,
    earned: (a) => a.milestoneStreakWeeks >= 4,
    reason: (a) => `Kept a ${a.milestoneStreakWeeks}-week milestone streak.`,
  },
  {
    slug: "track-complete",
    name: "Track Complete",
    description: "Finished a full course.",
    icon: "🎓",
    criteria: "Complete every lesson in a course.",
    sortOrder: 60,
    earned: (a) => a.coursesCompleted >= 1,
    reason: (a) =>
      a.coursesCompleted === 1
        ? "Finished a course end to end."
        : `Finished ${a.coursesCompleted} courses.`,
  },
  {
    slug: "gluten-free-wizard",
    name: "Gluten-Free Wizard",
    description: "Made gluten-free cooking look easy.",
    icon: "🌾",
    criteria: "Share five gluten-free recipes.",
    sortOrder: 70,
    earned: (a) => a.glutenFreeRecipes >= 5,
    reason: (a) => `Shared ${a.glutenFreeRecipes} gluten-free recipes.`,
  },
  {
    slug: "recipe-remixer",
    name: "Recipe Remixer",
    description: "Turned someone else's recipe into your own.",
    icon: "🔀",
    criteria: "Publish three recipe variations.",
    sortOrder: 80,
    earned: (a) => a.recipeVariations >= 3,
    reason: (a) => `Published ${a.recipeVariations} recipe variations.`,
  },
  {
    slug: "challenge-finisher",
    name: "Challenge Finisher",
    description: "Finished what you started.",
    icon: "🏁",
    criteria: "Complete a community challenge.",
    sortOrder: 90,
    earned: (a) => a.challengesFinished >= 1,
    reason: () => "Finished a community challenge.",
  },
  {
    slug: "connector",
    name: "Connector",
    description: "Introduced yourself and meant it.",
    icon: "🫱",
    criteria: "Start conversations with five members.",
    sortOrder: 100,
    earned: (a) => a.connectionsMade >= 5,
    reason: (a) => `Started conversations with ${a.connectionsMade} members.`,
  },
  {
    slug: "local-guide",
    name: "Local Guide",
    description: "Pointed members to good food near you.",
    icon: "📍",
    criteria: "Write three place testimonials.",
    sortOrder: 110,
    earned: (a) => a.placesReviewed >= 3,
    reason: (a) => `Reviewed ${a.placesReviewed} local places.`,
  },
  {
    slug: "one-year-in",
    name: "One Year In",
    description: "A year of cooking with this community.",
    icon: "🌱",
    criteria: "Be a member for a year.",
    sortOrder: 120,
    earned: (a) => a.memberSinceDays >= 365,
    reason: () => "One year with Vegan University.",
  },
];

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
