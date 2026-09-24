import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFeed } from "@/lib/community/feed";
import { toFeedCard } from "@/lib/community/feed-card";
import { prisma } from "@/lib/db";

/**
 * The next page of the feed.
 *
 * Only pages after the first: the first is server-rendered with the page, so
 * the feed is readable before any JavaScript runs and the scroll handler only
 * ever asks for more. Authorisation is the same `listFeed` the page uses, so
 * this endpoint cannot show anything the page would not.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("space");
  let spaceId: string | undefined;
  if (slug) {
    const space = await prisma.space.findUnique({
      where: { slug },
      select: { id: true },
    });
    // An unknown slug must not silently widen to the whole community.
    if (!space) return NextResponse.json({ posts: [], nextCursor: null });
    spaceId = space.id;
  }

  const page = await listFeed({
    userId: session.user.id,
    spaceId,
    sort: url.searchParams.get("sort") ?? undefined,
    cursor: url.searchParams.get("cursor"),
  });

  return NextResponse.json({
    posts: page.posts.map(toFeedCard),
    nextCursor: page.nextCursor,
  });
}
