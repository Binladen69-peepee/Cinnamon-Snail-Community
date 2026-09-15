import { prisma } from "@/lib/db";
import { getNextLiveClass } from "@/lib/marketing/catalog";
import {
  NAV_SECTION_SUGGESTIONS,
  type SearchSuggestion,
} from "@/lib/search/suggest";

/** Server-only: live catalog rows plus the standing section list. */
export async function getNavSuggestions(): Promise<SearchSuggestion[]> {
  const live: SearchSuggestion[] = [];

  if (!process.env.DATABASE_URL) {
    return [...NAV_SECTION_SUGGESTIONS];
  }

  try {
    const [nextLive, courses] = await Promise.all([
      getNextLiveClass(),
      prisma.course.findMany({
        where: { published: true },
        orderBy: [{ liveAt: "asc" }, { title: "asc" }],
        take: 8,
        select: { slug: true, title: true, liveAt: true },
      }),
    ]);

    if (nextLive) {
      live.push({
        label: nextLive.title,
        href: `/learn/${nextLive.slug}`,
        group: "Live classes",
        snippet: nextLive.liveAt
          ? `Live ${nextLive.liveAt.toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
            })}`
          : "Next live cook-along",
      });
    }

    for (const course of courses) {
      if (nextLive && course.slug === nextLive.slug) continue;
      live.push({
        label: course.title,
        href: `/learn/${course.slug}`,
        group: course.liveAt ? "Live classes" : "Classes",
      });
    }
  } catch {
    // Search still works from the standing section list.
  }

  return [...live, ...NAV_SECTION_SUGGESTIONS];
}
