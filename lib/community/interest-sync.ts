import "server-only";
import { prisma } from "@/lib/db";
import {
  INTERESTS,
  MAX_INTERESTS_PER_MEMBER,
  mapLegacyInterest,
} from "@/lib/community/interests";

/**
 * Getting the catalog and the old free text into the tag table.
 *
 * Two jobs, both idempotent, both safe to run against a live database as
 * often as anybody likes:
 *
 * `syncInterests` mirrors `lib/community/interests.ts` into the `Interest`
 * table. The file is the reviewable source of truth; the rows are what the
 * database can join and count against. Running it after a deploy that adds a
 * cuisine is how the cuisine becomes selectable.
 *
 * `backfillMemberInterests` reads what members wrote when interests were free
 * text and maps it onto the catalog. It reports every mapping it made and
 * every string it could not place, because a backfill that silently discards
 * a member's answers is worse than one that leaves them alone.
 */

export type SyncResult = {
  created: number;
  updated: number;
  /** In the table but no longer in the file. Reported, never deleted. */
  orphaned: string[];
};

export async function syncInterests(): Promise<SyncResult> {
  const existing = await prisma.interest.findMany({
    select: { slug: true, label: true, kind: true, sortOrder: true },
  });
  const bySlug = new Map(existing.map((row) => [row.slug, row]));

  let created = 0;
  let updated = 0;

  for (const [index, option] of INTERESTS.entries()) {
    const current = bySlug.get(option.slug);
    if (!current) {
      await prisma.interest.create({
        data: { ...option, sortOrder: index },
      });
      created += 1;
      continue;
    }
    if (
      current.label !== option.label ||
      current.kind !== option.kind ||
      current.sortOrder !== index
    ) {
      await prisma.interest.update({
        where: { slug: option.slug },
        data: { label: option.label, kind: option.kind, sortOrder: index },
      });
      updated += 1;
    }
  }

  // Deliberately not deleted. Removing a row would take every member's pick
  // with it by cascade, which is a lot of destruction for a word somebody
  // took out of a list. Reported so it can be decided on deliberately.
  const wanted = new Set(INTERESTS.map((option) => option.slug));
  const orphaned = existing
    .map((row) => row.slug)
    .filter((slug) => !wanted.has(slug));

  return { created, updated, orphaned };
}

export type BackfillResult = {
  profiles: number;
  linked: number;
  /** Strings that had no home in the catalog, with how often they occurred. */
  unmapped: { value: string; count: number }[];
};

export async function backfillMemberInterests(): Promise<BackfillResult> {
  const catalog = await prisma.interest.findMany({
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(catalog.map((row) => [row.slug, row.id]));

  const profiles = await prisma.profile.findMany({
    select: {
      id: true,
      cookingInterests: true,
      dietaryInterests: true,
      _count: { select: { interests: true } },
    },
  });

  const unmapped = new Map<string, number>();
  let touched = 0;
  let linked = 0;

  for (const profile of profiles) {
    // A member who has already chosen from the catalog is left alone: their
    // picks are newer and more deliberate than anything the old column holds.
    if (profile._count.interests > 0) continue;

    const raw = [
      ...asStrings(profile.cookingInterests),
      ...asStrings(profile.dietaryInterests),
    ];
    if (raw.length === 0) continue;

    const slugs = new Set<string>();
    for (const value of raw) {
      const slug = mapLegacyInterest(value);
      if (!slug) {
        const key = value.trim().toLowerCase();
        unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
        continue;
      }
      slugs.add(slug);
    }

    const ids = [...slugs]
      .slice(0, MAX_INTERESTS_PER_MEMBER)
      .flatMap((slug) => {
        const id = idBySlug.get(slug);
        return id ? [id] : [];
      });
    if (ids.length === 0) continue;

    // `skipDuplicates` rather than a delete-then-insert: two runs racing must
    // not leave a member with no interests in between.
    const result = await prisma.profileInterest.createMany({
      data: ids.map((interestId) => ({ profileId: profile.id, interestId })),
      skipDuplicates: true,
    });
    linked += result.count;
    touched += 1;
  }

  return {
    profiles: touched,
    linked,
    unmapped: [...unmapped.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
