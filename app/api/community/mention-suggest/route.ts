import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Who you might be typing the name of.
 *
 * Signed-in only, and capped, because this is a directory lookup by prefix and
 * an open one is a member-list scraper. It searches handle and display name,
 * since people think of each other by either.
 *
 * Deliberately not filtered by space membership: mentioning someone who is not
 * in the room is how you invite them into a conversation, and the notification
 * they get links to a post they may or may not be able to open — which the
 * post's own permission check decides, not this list.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ people: [] }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return NextResponse.json({ people: [] });

  const people = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { handle: { startsWith: query, mode: "insensitive" } },
        { profile: { displayName: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: { handle: "asc" },
    take: 6,
    select: {
      handle: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    people: people.map((person) => ({
      handle: person.handle,
      name: person.profile?.displayName ?? person.handle,
      avatarUrl: person.profile?.avatarUrl ?? null,
    })),
  });
}
