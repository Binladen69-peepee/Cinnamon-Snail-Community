/**
 * Links to one comment (C4).
 *
 * A comment renders with `id="comment-<id>"`, and anything that points at one
 * — a profile's activity, a notification, search — links to
 * `/posts/<postId>#comment-<commentId>`. The post page opens the thread that
 * holds it and scrolls to it. Pure, so the shape of the link and the rule for
 * finding the thread are tested once and shared by every caller.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The post page's reply box, which the card's Comment action jumps to there. */
export const REPLY_BOX_ID = "reply-box";

/** The element id a comment renders with. */
export function commentAnchorId(commentId: string): string {
  return `comment-${commentId}`;
}

/** The address of one comment, on its post's page. */
export function commentHref(postId: string, commentId: string): string {
  return `/posts/${postId}#${commentAnchorId(commentId)}`;
}

/** The comment id a URL fragment points at, or null. */
export function commentIdFromHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith("comment-")) return null;
  let id = raw.slice("comment-".length);
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  return ID.test(id) ? id : null;
}

/**
 * The ids from the root of a thread down to one comment, inclusive, or null
 * when the comment is not in the tree. Everything on the path has to be open
 * for the comment to be on screen.
 */
export function pathToComment<T extends { id: string; replies: T[] }>(
  tree: T[],
  commentId: string,
): string[] | null {
  for (const node of tree) {
    if (node.id === commentId) return [node.id];
    const below = pathToComment(node.replies, commentId);
    if (below) return [node.id, ...below];
  }
  return null;
}
