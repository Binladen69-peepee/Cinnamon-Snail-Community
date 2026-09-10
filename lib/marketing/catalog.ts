import { prisma } from "@/lib/db";
import { realPhotoOnly } from "@/lib/marketing/stock-hosts";

export type CatalogCard = {
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  teaserVideoUrl: string | null;
  liveAt: Date | null;
};

export type CatalogRow = {
  category: string;
  courses: CatalogCard[];
};

/**
 * The public catalog rows, grouped by category.
 *
 * This reads from the Course table on every request — the class list changes
 * constantly as new live cook-alongs are scheduled, so it must never be a
 * hardcoded array in the page. Category names and order come from the data too
 * (`categoryOrder`), so re-grouping the catalog is a data change, not a code
 * change.
 */
export async function getCatalogRows(): Promise<CatalogRow[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const courses = await prisma.course.findMany({
      where: { published: true, category: { not: null } },
      orderBy: [
        { categoryOrder: "asc" },
        { category: "asc" },
        { catalogOrder: "asc" },
        { title: "asc" },
      ],
      select: {
        slug: true,
        title: true,
        description: true,
        coverUrl: true,
        teaserVideoUrl: true,
        liveAt: true,
        category: true,
      },
    });

    const rows: CatalogRow[] = [];
    for (const course of courses) {
      const category = course.category!;
      const row = rows.find((item) => item.category === category);
      const card: CatalogCard = {
        slug: course.slug,
        title: course.title,
        description: course.description,
        // Demo seed data can carry stock covers; they must never reach the
        // public sales page, so the card falls back to "photo needed".
        coverUrl: realPhotoOnly(course.coverUrl),
        teaserVideoUrl: course.teaserVideoUrl,
        liveAt: course.liveAt,
      };
      if (row) {
        row.courses.push(card);
      } else {
        rows.push({ category, courses: [card] });
      }
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * The next scheduled live cook-along. This is the only urgency the sales pages
 * may use, because it is a true and specific date — no countdowns, no
 * "spots left".
 */
export async function getNextLiveClass(now = new Date()) {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await prisma.course.findFirst({
      where: { published: true, liveAt: { gt: now } },
      orderBy: { liveAt: "asc" },
      select: { slug: true, title: true, liveAt: true },
    });
  } catch {
    return null;
  }
}
