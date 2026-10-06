import {
  BADGE_FAMILIES,
  familyTiers,
  isRetiredBadge,
  ruleForSlug,
  type BadgeFamilyKey,
} from "@/lib/social/badge-rules";

/**
 * The badge catalogue as Connect's Recognition section shows it.
 *
 * Grouped by ladder, as `badge-rules.ts` defines them, instead of one flat
 * grid: each family (cooks shared, replies to members, classes finished…)
 * with its tiers in order and how many of them the member holds, so the next
 * rung is always the one just below the last earned.
 *
 * - The ladders come from the code, so they are complete even before the
 *   `Badge` table has caught up after a deploy.
 * - A badge outside the ladders that is still awarded (a challenge's own
 *   badge) is listed under "Special badges".
 * - A retired badge is never offered as something to earn. It appears, under
 *   "Legacy awards", only for a member who already holds it, and is not
 *   counted in "earned of available".
 *
 * Pure, so the rules are tested without a database.
 */

export type CatalogBadge = {
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  criteria: string | null;
  sortOrder: number;
};

export type HeldAward = {
  slug: string;
  awardedAt: Date;
  reason: string | null;
};

export type RecognitionBadge = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** What earning it takes. Null for a badge that cannot be earned any more. */
  criteria: string | null;
  earned: { awardedAt: Date; reason: string | null } | null;
};

export type RecognitionGroupKind = "ladder" | "special" | "legacy";

export type RecognitionGroup = {
  key: BadgeFamilyKey | "special" | "legacy";
  kind: RecognitionGroupKind;
  label: string;
  /** Why the group exists, in one line. */
  purpose: string;
  badges: RecognitionBadge[];
  /** How many in this group the member holds. */
  earned: number;
};

export type Recognition = {
  /** Ladders in catalogue order, then special badges, then legacy awards. */
  groups: RecognitionGroup[];
  /** Badges that can still be earned: every ladder tier and special badge. */
  available: number;
  /** How many of those the member holds. Legacy awards are not counted. */
  earned: number;
};

export const SPECIAL_BADGES_LABEL = "Special badges";
export const LEGACY_AWARDS_LABEL = "Legacy awards";

const FALLBACK_ICON = "★";

function earnedFrom(held: HeldAward | undefined): RecognitionBadge["earned"] {
  return held ? { awardedAt: held.awardedAt, reason: held.reason } : null;
}

function group(
  key: RecognitionGroup["key"],
  kind: RecognitionGroupKind,
  label: string,
  purpose: string,
  badges: RecognitionBadge[],
): RecognitionGroup {
  return {
    key,
    kind,
    label,
    purpose,
    badges,
    earned: badges.filter((badge) => badge.earned).length,
  };
}

const byCatalogOrder = (a: CatalogBadge, b: CatalogBadge) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function groupBadgeCatalog(input: {
  catalog: CatalogBadge[];
  held: HeldAward[];
}): Recognition {
  const heldBySlug = new Map(input.held.map((row) => [row.slug, row]));

  const ladders = BADGE_FAMILIES.map((family) =>
    group(
      family.key,
      "ladder",
      family.label,
      family.purpose,
      familyTiers(family.key).map((rule) => ({
        slug: rule.slug,
        name: rule.name,
        description: rule.description,
        icon: rule.icon,
        criteria: rule.criteria,
        earned: earnedFrom(heldBySlug.get(rule.slug)),
      })),
    ),
  ).filter((ladder) => ladder.badges.length > 0);

  const outside = [...input.catalog]
    .filter((row) => !ruleForSlug(row.slug))
    .sort(byCatalogOrder);

  const special = outside
    .filter((row) => !isRetiredBadge(row.slug))
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      icon: row.icon || FALLBACK_ICON,
      criteria: row.criteria,
      earned: earnedFrom(heldBySlug.get(row.slug)),
    }));

  const legacy = outside
    .filter((row) => isRetiredBadge(row.slug) && heldBySlug.has(row.slug))
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      icon: row.icon || FALLBACK_ICON,
      criteria: null,
      earned: earnedFrom(heldBySlug.get(row.slug)),
    }));

  const groups = [...ladders];
  if (special.length > 0) {
    groups.push(
      group(
        "special",
        "special",
        SPECIAL_BADGES_LABEL,
        "One-off badges, such as the one for finishing a particular challenge.",
        special,
      ),
    );
  }
  if (legacy.length > 0) {
    groups.push(
      group(
        "legacy",
        "legacy",
        LEGACY_AWARDS_LABEL,
        "No longer awarded. Yours to keep.",
        legacy,
      ),
    );
  }

  const earnable = groups.filter((entry) => entry.kind !== "legacy");
  return {
    groups,
    available: earnable.reduce((sum, entry) => sum + entry.badges.length, 0),
    earned: earnable.reduce((sum, entry) => sum + entry.earned, 0),
  };
}
