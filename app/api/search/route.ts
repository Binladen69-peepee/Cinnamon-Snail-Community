import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { searchEntities } from "@/lib/search";
import { searchGroupLabel, searchGroupOrder, searchHref } from "@/lib/search/links";

export type PaletteHit = {
  id: string;
  type: string;
  title: string;
  snippet: string;
  href: string;
};

export type PaletteGroup = { label: string; hits: PaletteHit[] };

/**
 * Search for the command palette.
 *
 * Returns results already grouped and already resolved to hrefs, so the client
 * holds no routing knowledge and the palette stays a rendering concern. Members
 * only — the community is behind the paywall, and search would otherwise leak
 * post titles.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ groups: [] });

  const rows = await searchEntities({ query, limit: 24 });

  const byType = new Map<string, PaletteHit[]>();
  for (const row of rows) {
    const hits = byType.get(row.entityType) ?? [];
    // Four per group keeps the palette one screen tall without scrolling.
    if (hits.length >= 4) continue;
    hits.push({
      id: row.id,
      type: row.entityType,
      title: row.title || "Untitled",
      snippet: (row.body ?? "").slice(0, 120),
      href: searchHref(row.entityType, row.entityId),
    });
    byType.set(row.entityType, hits);
  }

  const groups: PaletteGroup[] = [...byType.entries()]
    .sort(([a], [b]) => searchGroupOrder(a) - searchGroupOrder(b))
    .map(([type, hits]) => ({ label: searchGroupLabel(type), hits }));

  return NextResponse.json({ groups });
}
