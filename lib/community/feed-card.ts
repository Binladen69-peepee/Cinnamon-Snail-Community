import type { FeedPost } from "@/lib/community/feed";
import type { BulletinCardData } from "@/lib/bulletin/feed";

/**
 * The post as the card needs it, and nothing else.
 *
 * The feed query returns whole rows, which carry things a browser has no
 * business receiving: the space's product and approval settings, every column
 * of the post. Every path that hands a post to a client component goes
 * through here — the first page, the infinite-scroll endpoint, the post page —
 * so the shape is narrowed once and the paths cannot drift apart.
 *
 * Client-safe: type imports only, so a client component may import
 * `reviveFeedCard` without pulling the database into the browser bundle.
 */
export type FeedCardPost = {
  id: string;
  title: string | null;
  /** The stored markdown, rendered on the card through `<RichText>` (C2). */
  body: string;
  /** Kept for older callers. The card renders `body`, never this. */
  bodyHtml: string | null;
  plainText: string;
  /** Plain text with no markup, for one-line previews and captions. */
  excerpt: string;
  type: string;
  linkUrl: string | null;
  /** Set when the team made this an announcement. */
  pinnedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  editedAt: string | null;
  score: number;
  myVote: number;
  myReaction: string | null;
  reactionCounts: Record<string, number>;
  /** Whether this reader has pinned it (a `Bookmark` row). */
  myBookmark: boolean;
  /** When this reader pinned it. */
  myPinnedAt: string | null;
  myPollOptionId: string | null;
  authorFollowerCount: number;
  viewerFollowsAuthor: boolean;
  sharedFromPostId: string | null;
  event: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
    capacity: number | null;
    status: string;
  } | null;
  recipe: { id: string; slug: string; title: string } | null;
  /** The Bulletin Board item behind a BULLETIN post (C3). */
  bulletin: BulletinCardData | null;
  comments: {
    id: string;
    body: string;
    excerpt: string;
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

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export function toFeedCard(post: FeedPost): FeedCardPost {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    bodyHtml: post.bodyHtml,
    plainText: post.plainText,
    excerpt: post.excerpt,
    type: post.type,
    linkUrl: post.linkUrl,
    pinnedAt: iso(post.pinnedAt),
    publishedAt: iso(post.publishedAt),
    createdAt: post.createdAt.toISOString(),
    editedAt: iso(post.editedAt),
    score: post.score,
    myVote: post.myVote,
    myReaction: post.myReaction,
    reactionCounts: post.reactionCounts,
    myBookmark: post.myBookmark,
    myPinnedAt: iso(post.myPinnedAt),
    myPollOptionId: post.myPollOptionId,
    authorFollowerCount: post.authorFollowerCount,
    viewerFollowsAuthor: post.viewerFollowsAuthor,
    sharedFromPostId: post.sharedFromPostId,
    event: post.event
      ? {
          id: post.event.id,
          slug: post.event.slug,
          title: post.event.title,
          startsAt: post.event.startsAt.toISOString(),
          endsAt: iso(post.event.endsAt),
          location: post.event.location,
          capacity: post.event.capacity,
          status: post.event.status,
        }
      : null,
    recipe: post.recipe
      ? { id: post.recipe.id, slug: post.recipe.slug, title: post.recipe.title }
      : null,
    bulletin: post.bulletin,
    comments: post.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      excerpt: comment.excerpt,
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
