import { commentHref } from "@/lib/community/comment-anchor";
import { IDEAS_PATH } from "@/lib/community/system-spaces";

/**
 * A profile's activity, where every row is a link to the exact place it
 * happened.
 *
 * The client's ask was simple: clicking a post or a comment on someone's
 * activity tab should take you to that post or comment. So every item carries
 * an `href`, built here by pure functions that are tested on their own:
 *
 * - a post opens on its page (`/posts/<id>`), an idea on the Ideas board
 *   (`/ideas/<id>`), because that is where its votes and status live;
 * - a comment opens on its post with the comment's anchor (contract C4,
 *   `/posts/<postId>#comment-<commentId>`), or on the idea's page for a reply
 *   to an idea;
 * - a lesson opens on the lesson, a class on the class, a live class on its
 *   page, a challenge on the challenge, a recipe variation on the recipe's
 *   post, and a badge on the member's badges tab.
 *
 * What a viewer may see is decided by the loader in `lib/community/profile.ts`
 * (posts in rooms they cannot enter, removed and hidden posts, and threads by
 * anyone either of them has blocked never become items).
 */

export type ActivityKind =
  | "post"
  | "question"
  | "recipe"
  | "media"
  | "poll"
  | "idea"
  | "bulletin"
  | "comment"
  | "variation"
  | "challenge"
  | "live-class"
  | "lesson"
  | "class"
  | "badge";

export type ActivityItem = {
  /** Unique across kinds: `post:<id>`, `comment:<id>`… */
  id: string;
  kind: ActivityKind;
  /** What happened, in a few words: "Asked a question". */
  label: string;
  /** The thing itself, as plain text: a title or an excerpt. */
  detail: string | null;
  /** The exact place it happened. */
  href: string;
  at: Date;
};

const segment = (value: string) => encodeURIComponent(value);

/** Where a post lives. Ideas have their own page; everything else is a post page. */
export function postHref(post: { id: string; type: string }): string {
  return post.type === "IDEA" ? `${IDEAS_PATH}/${segment(post.id)}` : `/posts/${segment(post.id)}`;
}

/** One comment, on the page its post lives on, scrolled to (C4). */
export function commentActivityHref(comment: {
  id: string;
  postId: string;
  postType: string;
}): string {
  if (comment.postType === "IDEA") {
    return `${IDEAS_PATH}/${segment(comment.postId)}#comment-${segment(comment.id)}`;
  }
  return commentHref(comment.postId, comment.id);
}

export function lessonHref(courseSlug: string, lessonSlug: string): string {
  return `/learn/${segment(courseSlug)}/${segment(lessonSlug)}`;
}

export function classHref(courseSlug: string): string {
  return `/learn/${segment(courseSlug)}`;
}

export function liveClassHref(slug: string): string {
  return `/live-classes/${segment(slug)}`;
}

export function challengeHref(slug: string): string {
  return `/challenges/${segment(slug)}`;
}

export function crewHref(slug: string): string {
  return `/crews/${segment(slug)}`;
}

/**
 * A recipe variation, on the post that carries its recipe. The variations
 * list is on that page; `#variation-<id>` lands on the row once the list
 * carries anchors, and is harmless until then.
 */
export function variationHref(recipePostId: string, variationId: string): string {
  return `/posts/${segment(recipePostId)}#variation-${segment(variationId)}`;
}

export function profileTabHref(handle: string, tab: string): string {
  return `/members/${segment(handle)}?tab=${segment(tab)}`;
}

/** A badge, on its owner's badges tab, scrolled to. */
export function badgeHref(handle: string, slug: string): string {
  return `${profileTabHref(handle, "badges")}#badge-${segment(slug)}`;
}

/**
 * What posting a post of this type is called on an activity row. A post in a
 * class's discussion room or a live class's room says so, rather than
 * claiming the Kitchen Table.
 */
export function postActivity(
  type: string,
  spaceKind?: string | null,
): { kind: ActivityKind; label: string } {
  if (type !== "IDEA" && spaceKind === "COURSE") {
    return { kind: "post", label: "Started a class discussion" };
  }
  if (type !== "IDEA" && spaceKind === "EVENTS") {
    return { kind: "post", label: "Posted about a live class" };
  }
  switch (type) {
    case "QUESTION":
      return { kind: "question", label: "Asked a question" };
    case "RECIPE":
      return { kind: "recipe", label: "Shared a recipe" };
    case "IMAGE":
      return { kind: "media", label: "Shared a photo" };
    case "VIDEO":
      return { kind: "media", label: "Shared a video" };
    case "POLL":
      return { kind: "poll", label: "Started a poll" };
    case "IDEA":
      return { kind: "idea", label: "Suggested an idea" };
    case "BULLETIN":
      return { kind: "bulletin", label: "Posted on the Bulletin Board" };
    case "EVENT":
      return { kind: "post", label: "Shared an event" };
    default:
      return { kind: "post", label: "Posted in the Kitchen Table" };
  }
}

/** Newest first, ties broken by id so the order never shuffles between loads. */
export function mergeActivity(groups: ActivityItem[][], limit: number): ActivityItem[] {
  return groups
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
