/**
 * Feed and comment ordering.
 *
 * The feed's three orders are done by the database, against an index, with a
 * cursor — they are names for an `ORDER BY`, not for a comparison function.
 * Nothing here re-sorts a page of posts after it arrives, because ranking a
 * window of eighty rows in JavaScript is how a feed ends up unable to show the
 * eighty-first.
 *
 * Comments are different and stay here: a post's replies are loaded as one
 * bounded set and nested into a tree, which is a shape the database cannot
 * return directly.
 */

export type FeedSort = "active" | "new" | "top";

export const FEED_SORTS: { value: FeedSort; label: string; hint: string }[] = [
  { value: "active", label: "Recent activity", hint: "Posts people are still replying to" },
  { value: "new", label: "New", hint: "Newest first" },
  { value: "top", label: "Top this week", hint: "Best received in the last seven days" },
];

/** How far back "top this week" looks. */
export const TOP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function parseFeedSort(value: string | string[] | undefined): FeedSort {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "new" || raw === "top" || raw === "active") return raw;
  // The feed used to offer Reddit's hot and rising. Links to those still exist
  // in bookmarks and in the wild, and both meant "what is lively", so they land
  // on the order that now means that rather than on a 404 or a silent default
  // to something unrelated.
  if (raw === "hot" || raw === "rising") return "active";
  return "active";
}

export type CommentSort = "new" | "old" | "top";

export const COMMENT_SORTS: { value: CommentSort; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "new", label: "Newest" },
  { value: "old", label: "Oldest" },
];

export function parseCommentSort(value: string | string[] | undefined): CommentSort {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "new" || raw === "old" || raw === "top") return raw;
  return "top";
}

export type NestableComment = {
  id: string;
  parentId: string | null;
  score: number;
  createdAt: Date;
};

export type NestedComment<T extends NestableComment> = T & {
  replies: NestedComment<T>[];
};

function compareComments<T extends NestableComment>(sort: CommentSort) {
  return (a: T, b: T): number => {
    if (sort === "old") return a.createdAt.getTime() - b.createdAt.getTime();
    if (sort === "new") return b.createdAt.getTime() - a.createdAt.getTime();
    if (b.score !== a.score) return b.score - a.score;
    return a.createdAt.getTime() - b.createdAt.getTime();
  };
}

/**
 * Builds the reply tree.
 *
 * Replies are always oldest-first whatever the top-level order is: a
 * conversation read out of sequence is not a conversation. Only the roots
 * respond to the sort.
 *
 * An orphan — a comment whose parent is not in this batch — is promoted to a
 * root rather than dropped. Losing a reply because its parent was deleted is
 * worse than showing it slightly out of place.
 */
export function nestComments<T extends NestableComment>(
  comments: T[],
  sort: CommentSort = "top",
): NestedComment<T>[] {
  type Node = NestedComment<T>;
  const nodes = new Map<string, Node>();
  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }
  const roots: Node[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  const oldestFirst = compareComments<Node>("old");
  for (const node of nodes.values()) {
    node.replies.sort(oldestFirst);
  }
  roots.sort(compareComments<Node>(sort));
  return roots;
}
