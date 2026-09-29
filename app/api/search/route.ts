import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { groupHits, searchForViewer } from "@/lib/search/results";

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

/**
 * Search for the command palette.
 *
 * Returns results already grouped and already resolved to hrefs, so the client
 * holds no routing knowledge and the palette stays a rendering concern. Members
 * only — the community is behind the paywall, and search would otherwise leak
 * post titles.
 *
 * Every hit goes through `searchForViewer`, the same loader as `/search`, so
 * the palette cannot show a post from a room the viewer may not enter, a
 * member who hid themselves, or a row whose record has since been removed.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ groups: [] });

  const hits = await searchForViewer({ viewerId: session.user.id, query, limit: 24 });
  // Four per group keeps the palette one screen tall without scrolling.
  const groups: PaletteGroup[] = groupHits(hits, 4).map((group) => ({
    label: group.label,
    hits: group.hits.map((hit) => ({ ...hit, snippet: hit.snippet.slice(0, 120) })),
  }));

  return NextResponse.json({ groups });
}
