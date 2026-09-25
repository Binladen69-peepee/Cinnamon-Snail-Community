import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { searchEntities } from "@/lib/search";
import { searchGroupLabel, searchGroupOrder, searchHref } from "@/lib/search/links";
import {
  filterHiddenMembers,
  getMemberVisibility,
} from "@/lib/community/member-visibility";

export type PaletteHit = {
  id: string;
  type: string;
  title: string;
  snippet: string;
  href: string;
  imageUrl?: string | null;
  detail: string;
};

export type PaletteGroup = { label: string; hits: PaletteHit[] };

const TYPE_DETAIL: Record<string, string> = {
  member: "Member",
  post: "Post",
  course: "Course",
  lesson: "Lesson",
  event: "Event",
  comment: "Comment",
};

/**
 * Search for the command palette.
 *
 * Returns results already grouped and already resolved to hrefs, so the client
 * holds no routing knowledge and the palette stays a rendering concern. Members
 * only — the community is behind the paywall, and search would otherwise leak
 * post titles.
 *
 * Member hits are filtered against the viewer before anything is returned. The
 * index has a row per member and knew nothing about privacy, so somebody who
 * switched themselves out of the directory was still findable here by name.
 * The switch has to mean the same thing everywhere it can be observed.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ groups: [] });

  const [found, visibility] = await Promise.all([
    // Over-fetch a little, because the privacy filter removes rows after the
    // ranking and a page of results should not thin out to nothing.
    searchEntities({ query, limit: 40 }),
    getMemberVisibility(session.user.id),
  ]);
  const rows = filterHiddenMembers(found, visibility).slice(0, 24);
  const media = await loadHitMedia(rows);

  const byType = new Map<string, PaletteHit[]>();
  for (const row of rows) {
    const hits = byType.get(row.entityType) ?? [];
    // Four per group keeps the palette one screen tall without scrolling.
    if (hits.length >= 4) continue;
    const extras = media.get(`${row.entityType}:${row.entityId}`);
    hits.push({
      id: row.id,
      type: row.entityType,
      title: row.title || "Untitled",
      snippet: (row.body ?? "").slice(0, 120),
      href: searchHref(row.entityType, row.entityId),
      imageUrl: extras?.imageUrl,
      detail: extras?.detail ?? TYPE_DETAIL[row.entityType] ?? row.entityType,
    });
    byType.set(row.entityType, hits);
  }

  const groups: PaletteGroup[] = [...byType.entries()]
    .sort(([a], [b]) => searchGroupOrder(a) - searchGroupOrder(b))
    .map(([type, hits]) => ({ label: searchGroupLabel(type), hits }));

  return NextResponse.json({ groups });
}

async function loadHitMedia(
  rows: { entityType: string; entityId: string }[],
): Promise<Map<string, { imageUrl?: string | null; detail: string }>> {
  const out = new Map<string, { imageUrl?: string | null; detail: string }>();
  const handles = rows
    .filter((row) => row.entityType === "member")
    .map((row) => row.entityId);
  const slugs = rows
    .filter((row) => row.entityType === "course")
    .map((row) => row.entityId);

  try {
    const [users, courses] = await Promise.all([
      handles.length
        ? prisma.user.findMany({
            where: { handle: { in: handles } },
            select: { handle: true, image: true },
          })
        : [],
      slugs.length
        ? prisma.course.findMany({
            where: { slug: { in: slugs } },
            select: { slug: true, coverUrl: true },
          })
        : [],
    ]);

    for (const user of users) {
      out.set(`member:${user.handle}`, {
        imageUrl: user.image,
        detail: `@${user.handle}`,
      });
    }
    for (const course of courses) {
      out.set(`course:${course.slug}`, {
        imageUrl: course.coverUrl,
        detail: "Course",
      });
    }
  } catch {
    // Hits still render with type labels and no photo.
  }

  return out;
}
