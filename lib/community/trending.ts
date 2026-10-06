import "server-only";
import { prisma } from "@/lib/db";
import { getUserAuth, getViewerMemberships } from "@/lib/community/viewer";
import { getCommunityFeedSpaceIds } from "@/lib/community/system-spaces";
import {
  communityFeedWhere,
  excerptOf,
  feedVisibilityFilter,
} from "@/lib/community/feed";

export type PopularPost = {
  id: string;
  /** The post's title, or the start of what it says. Never markup. */
  label: string;
  authorName: string;
  comments: number;
  reactions: number;
};

/** How far back "this week" looks. */
const WINDOW_MS = 7 * 86_400_000;

/**
 * The Kitchen Table conversations with the most replies this week.
 *
 * It replaced "trending spaces" when spaces left the interface (DEC-078): the
 * question a member has is "what is everyone talking about", and the answer is
 * a conversation, not a room. Counts come from the columns kept in step with
 * the rows, so every number shown is a real one; a post nobody has replied to
 * is not "popular" and is left out.
 */
export async function popularThisWeek(userId: string, take = 4): Promise<PopularPost[]> {
  const auth = await getUserAuth(userId);
  if (!auth) return [];
  const [memberships, spaceIds] = await Promise.all([
    getViewerMemberships(userId),
    getCommunityFeedSpaceIds(),
  ]);
  const now = new Date();

  const rows = await prisma.post.findMany({
    where: {
      AND: [
        {
          status: "PUBLISHED",
          publishedAt: { gte: new Date(now.getTime() - WINDOW_MS), lte: now },
          commentCount: { gt: 0 },
        },
        communityFeedWhere(spaceIds),
        feedVisibilityFilter(auth, [...memberships.keys()]),
      ],
    },
    orderBy: [{ commentCount: "desc" }, { reactionCount: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      body: true,
      plainText: true,
      commentCount: true,
      reactionCount: true,
      author: {
        select: { handle: true, profile: { select: { displayName: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    label: row.title?.trim() || excerptOf(row.body, row.plainText).slice(0, 90) || "A post",
    authorName: row.author.profile?.displayName ?? row.author.handle,
    comments: row.commentCount,
    reactions: row.reactionCount,
  }));
}
