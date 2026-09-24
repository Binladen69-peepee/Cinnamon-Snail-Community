import type { FeedPost } from "@/lib/community/feed";

/**
 * The post as the card needs it, and nothing else.
 *
 * The feed query returns whole rows, which carry things a browser has no
 * business receiving: the author's email, the space's product and approval
 * settings, every column of the post. Server-rendering hides that, but the
 * infinite-scroll endpoint serialises to JSON over the wire, so the shape is
 * narrowed once, here, and both paths use it.
 *
 * Narrowing it in one place is also what keeps the two paths identical. A
 * second page that differs from the first in some small way is the classic
 * infinite-scroll bug.
 */
export type FeedCardPost = {
  id: string;
  title: string | null;
  bodyHtml: string | null;
  plainText: string;
  type: string;
  linkUrl: string | null;
  pinnedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  editedAt: string | null;
  score: number;
  myVote: number;
  myReaction: string | null;
  reactionCounts: Record<string, number>;
  myBookmark: boolean;
  authorFollowerCount: number;
  viewerFollowsAuthor: boolean;
  sharedFromPostId: string | null;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
    capacity: number | null;
  } | null;
  recipe: { id: string; slug: string; title: string } | null;
  comments: {
    id: string;
    body: string;
    author: {
      handle: string;
      profile: { displayName: string; avatarUrl: string | null } | null;
    };
  }[];
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  space: { id: string; name: string; slug: string; kind: string };
  attachments: {
    id: string;
    url: string;
    alt: string | null;
    kind: string;
    width: number | null;
    height: number | null;
    thumbnailUrl: string | null;
  }[];
  pollOptions: { id: string; label: string; _count: { votes: number } }[];
  _count: { comments: number; bookmarks: number };
};

export function toFeedCard(post: FeedPost): FeedCardPost {
  return {
    id: post.id,
    title: post.title,
    bodyHtml: post.bodyHtml,
    plainText: post.plainText,
    type: post.type,
    linkUrl: post.linkUrl,
    pinnedAt: post.pinnedAt ? post.pinnedAt.toISOString() : null,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    editedAt: post.editedAt ? post.editedAt.toISOString() : null,
    score: post.score,
    myVote: post.myVote,
    myReaction: post.myReaction,
    reactionCounts: post.reactionCounts,
    myBookmark: post.myBookmark,
    authorFollowerCount: post.authorFollowerCount,
    viewerFollowsAuthor: post.viewerFollowsAuthor,
    sharedFromPostId: post.sharedFromPostId,
    event: post.event
      ? {
          id: post.event.id,
          title: post.event.title,
          startsAt: post.event.startsAt.toISOString(),
          endsAt: post.event.endsAt ? post.event.endsAt.toISOString() : null,
          location: post.event.location,
          capacity: post.event.capacity,
        }
      : null,
    recipe: post.recipe
      ? { id: post.recipe.id, slug: post.recipe.slug, title: post.recipe.title }
      : null,
    comments: post.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      author: {
        handle: comment.author.handle,
        profile: comment.author.profile
          ? {
              displayName: comment.author.profile.displayName,
              avatarUrl: comment.author.profile.avatarUrl,
            }
          : null,
      },
    })),
    author: {
      handle: post.author.handle,
      profile: post.author.profile
        ? {
            displayName: post.author.profile.displayName,
            avatarUrl: post.author.profile.avatarUrl,
          }
        : null,
    },
    space: {
      id: post.space.id,
      name: post.space.name,
      slug: post.space.slug,
      kind: post.space.kind,
    },
    attachments: post.attachments.map((file) => ({
      id: file.id,
      url: file.url,
      alt: file.alt,
      kind: file.kind,
      width: file.width,
      height: file.height,
      thumbnailUrl: file.thumbnailUrl,
    })),
    pollOptions: post.pollOptions.map((option) => ({
      id: option.id,
      label: option.label,
      _count: { votes: option._count.votes },
    })),
    _count: post._count,
  };
}

/** Dates travel as strings over JSON and have to become dates again. */
export function reviveFeedCard(post: FeedCardPost) {
  return {
    ...post,
    pinnedAt: post.pinnedAt ? new Date(post.pinnedAt) : null,
    publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
    createdAt: new Date(post.createdAt),
    editedAt: post.editedAt ? new Date(post.editedAt) : null,
  };
}

export type RevivedFeedCard = ReturnType<typeof reviveFeedCard>;
