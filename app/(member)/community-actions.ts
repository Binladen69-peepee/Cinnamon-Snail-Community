"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { PostType } from "@prisma/client";
import { auth } from "@/auth";
import {
  addComment,
  createPost,
  decideOnPendingPost,
  deleteComment,
  deletePost,
  pinPost,
  publishPost,
  sharePostToSpace,
  updatePost,
} from "@/lib/community/posts";
import {
  reportPost,
  setPostReaction,
  toggleBookmark,
  toggleCommentReaction,
  votePoll,
} from "@/lib/community/engagement";
import { toggleVote } from "@/lib/community/votes";
import { guardCommunityAction } from "@/lib/community/rate-limits";
import { awardBadges } from "@/lib/social/badges";
import { kindOf } from "@/lib/uploads/policy";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

/**
 * Paths that show post state. Kept in one place so a new surface cannot be
 * added without its cache being considered.
 */
function revalidateFeeds(postId?: string) {
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
  if (postId) revalidatePath(`/posts/${postId}`);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Turns a thrown mutation into a message the interface can show.
 *
 * Every action below is triggered by a button, and a button that throws puts
 * the whole page into an error boundary. A refusal — no permission, too fast,
 * already gone — is an ordinary outcome and belongs next to the button.
 */
async function attempt(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That did not work.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Check every claimed attachment against what is actually in the bucket.
 *
 * The client tells us a URL, a size and a type; none of that is evidence. This
 * re-reads each object's stored metadata, which catches a client that asked for
 * a URL for a 1 KB image and then uploaded 80 MB, and it rejects any path that
 * does not sit under the member's own id.
 */
async function verifyAttachments(
  userId: string,
  claimed: unknown[],
): Promise<
  | {
      ok: true;
      files: {
        url: string;
        kind: string;
        alt?: string;
        mimeType?: string;
        width?: number | null;
        height?: number | null;
        thumbnailUrl?: string | null;
      }[];
    }
  | { ok: false; error: string }
> {
  if (claimed.length === 0) return { ok: true, files: [] };

  // Verifying an attachment is a round trip to object storage per file, so the
  // act of claiming attachments is itself rate limited.
  await guardCommunityAction("upload", userId);

  const files: {
    url: string;
    kind: string;
    alt?: string;
    mimeType?: string;
    width?: number | null;
    height?: number | null;
    thumbnailUrl?: string | null;
  }[] = [];

  for (const entry of claimed) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "Those attachments could not be read." };
    }
    const record = entry as Record<string, unknown>;
    const url = String(record.url ?? "");
    const path = objectPathFromUrl(url);
    if (!path) return { ok: false, error: "That attachment is not one of ours." };

    const verified = await verifyUploaded({ userId, path });
    if (!verified.ok) return { ok: false, error: verified.error };

    const kind = kindOf(verified.mimeType);
    if (!kind) return { ok: false, error: "That file type is not supported." };

    const alt = typeof record.alt === "string" ? record.alt.slice(0, 300) : undefined;
    const width = Number(record.width);
    const height = Number(record.height);

    let thumbnailUrl: string | null = null;
    if (kind === "video" && typeof record.thumbnailUrl === "string" && record.thumbnailUrl) {
      const thumbPath = objectPathFromUrl(record.thumbnailUrl);
      if (!thumbPath) {
        return { ok: false, error: "That video thumbnail is not one of ours." };
      }
      const thumb = await verifyUploaded({ userId, path: thumbPath });
      if (!thumb.ok) return { ok: false, error: thumb.error };
      if (kindOf(thumb.mimeType) !== "image") {
        return { ok: false, error: "Video thumbnails must be images." };
      }
      thumbnailUrl = record.thumbnailUrl;
    }

    files.push({
      url,
      kind,
      alt: alt || undefined,
      // The stored type wins over whatever the client claimed.
      mimeType: verified.mimeType,
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
      thumbnailUrl,
    });
  }

  return { ok: true, files };
}

/**
 * Post from the feed, with no navigation.
 *
 * Returns a result rather than throwing, so the composer shows the reason
 * inline instead of tripping an error boundary over a typo.
 */
export async function createPostAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId();
    const body = String(formData.get("body") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();

    // Attachments arrive as JSON because FormData cannot carry a nested list.
    let claimed: unknown[] = [];
    const raw = String(formData.get("attachments") ?? "");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) claimed = parsed.slice(0, 8);
      } catch {
        return { ok: false, error: "Those attachments could not be read." };
      }
    }

    // A photo on its own is a perfectly good post.
    if (!body && !title && claimed.length === 0) {
      return { ok: false, error: "Write something or add a photo first." };
    }

    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "Pick a space to post in." };

    const attachments = await verifyAttachments(userId, claimed);
    if (!attachments.ok) return { ok: false, error: attachments.error };

    const rawType = String(formData.get("type") ?? "");
    const explicit = (Object.values(PostType) as string[]).includes(rawType)
      ? (rawType as PostType)
      : null;
    // The type follows what was attached unless the composer said otherwise, so
    // the feed can frame it correctly.
    const hasVideo = attachments.files.some((file) => file.kind === "video");
    const type: PostType =
      explicit ??
      (hasVideo ? "VIDEO" : attachments.files.length > 0 ? "IMAGE" : "SIMPLE");

    const poll = [1, 2, 3, 4]
      .map((n) => String(formData.get(`poll${n}`) ?? "").trim())
      .filter(Boolean);
    if (type === "POLL" && poll.length < 2) {
      return { ok: false, error: "A poll needs at least two options." };
    }

    // `createPost` has always accepted a link, but nothing ever passed one, so
    // a LINK post had no URL. Only http(s) is allowed through: the value is
    // rendered as an href, and a `javascript:` string in that position is the
    // whole of the attack.
    const rawLink = String(formData.get("linkUrl") ?? "").trim();
    let linkUrl: string | undefined;
    if (rawLink) {
      let parsed: URL;
      try {
        parsed = new URL(rawLink);
      } catch {
        return { ok: false, error: "That link is not a valid URL." };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, error: "Links have to start with http or https." };
      }
      linkUrl = parsed.toString();
    }
    if (type === "LINK" && !linkUrl) {
      return { ok: false, error: "Paste the link you want to share." };
    }

    // The composer can ask for a draft or a scheduled post; anything else is
    // published now, subject to whatever the space says about approval.
    const rawIntent = String(formData.get("intent") ?? "PUBLISH");
    const intent =
      rawIntent === "DRAFT" || rawIntent === "SCHEDULE" ? rawIntent : "PUBLISH";
    const rawSchedule = String(formData.get("scheduledAt") ?? "").trim();
    let scheduledAt: Date | null = null;
    if (intent === "SCHEDULE") {
      const parsed = new Date(rawSchedule);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "That is not a date we can read." };
      }
      if (parsed.getTime() <= Date.now()) {
        return { ok: false, error: "Pick a time in the future." };
      }
      scheduledAt = parsed;
    }

    // An event needs a time, and a recipe needs a method. Both are read here
    // and checked here, because both write a row of their own.
    let event: Parameters<typeof createPost>[0]["event"] = null;
    if (type === "EVENT") {
      const startsAt = new Date(String(formData.get("startsAt") ?? ""));
      if (Number.isNaN(startsAt.getTime())) {
        return { ok: false, error: "An event needs a start time." };
      }
      const rawEnd = String(formData.get("endsAt") ?? "").trim();
      const endsAt = rawEnd ? new Date(rawEnd) : null;
      if (endsAt && Number.isNaN(endsAt.getTime())) {
        return { ok: false, error: "That end time is not one we can read." };
      }
      if (endsAt && endsAt <= startsAt) {
        return { ok: false, error: "An event cannot end before it starts." };
      }
      const rawZoom = String(formData.get("zoomUrl") ?? "").trim();
      let zoomUrl: string | null = null;
      if (rawZoom) {
        try {
          const parsed = new URL(rawZoom);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            return { ok: false, error: "That joining link is not a valid URL." };
          }
          zoomUrl = parsed.toString();
        } catch {
          return { ok: false, error: "That joining link is not a valid URL." };
        }
      }
      const rawCapacity = Number(formData.get("capacity") ?? "");
      event = {
        startsAt,
        endsAt,
        location: String(formData.get("location") ?? "").trim() || null,
        zoomUrl,
        capacity:
          Number.isFinite(rawCapacity) && rawCapacity > 0
            ? Math.trunc(rawCapacity)
            : null,
      };
    }

    let recipe: Parameters<typeof createPost>[0]["recipe"] = null;
    if (type === "RECIPE") {
      const method = String(formData.get("method") ?? "").trim();
      if (!method) return { ok: false, error: "Write the method, even roughly." };
      if (!title) return { ok: false, error: "A recipe needs a name." };
      recipe = {
        title,
        method: method.slice(0, 20000),
        coverUrl: attachments.files[0]?.url ?? null,
      };
    }

    await createPost({
      userId,
      spaceId,
      type,
      title: title || undefined,
      body,
      linkUrl,
      intent,
      scheduledAt,
      event,
      recipe,
      attachmentUrls: attachments.files,
      pollOptions: type === "POLL" ? poll : undefined,
    });

    revalidateFeeds();
    // Recognition is checked off the request path so posting stays fast.
    after(() => awardBadges(userId));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That did not post.",
    };
  }
}

export async function commentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !body) {
    return { ok: false, error: "Write something first." };
  }
  const result = await attempt(() =>
    addComment({
      userId,
      postId,
      body,
      parentId: String(formData.get("parentId") ?? "") || null,
    }),
  );
  if (result.ok) {
    revalidateFeeds(postId);
    after(() => awardBadges(userId));
  }
  return result;
}

/** Editing a post in place. */
export async function updatePostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !body) {
    return { ok: false, error: "A post needs something in it." };
  }
  const result = await attempt(() =>
    updatePost({
      userId,
      postId,
      title: String(formData.get("title") ?? "").trim() || null,
      body,
      linkUrl: String(formData.get("linkUrl") ?? "").trim() || null,
    }),
  );
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function deletePostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return { ok: false, error: "Nothing to remove." };
  const result = await attempt(() => deletePost({ userId, postId }));
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function deleteCommentAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const commentId = String(formData.get("commentId") ?? "");
  const postId = String(formData.get("postId") ?? "");
  if (!commentId) return { ok: false, error: "Nothing to remove." };
  const result = await attempt(() => deleteComment({ userId, commentId }));
  if (result.ok) revalidateFeeds(postId || undefined);
  return result;
}

/** Sends a draft live, or an approved post on its way. */
export async function publishPostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return { ok: false, error: "Nothing to publish." };
  const result = await attempt(() => publishPost({ userId, postId }));
  if (result.ok) revalidateFeeds(postId);
  return result;
}

/** A host letting a held post through, or turning it away. */
export async function reviewPostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  const approve = String(formData.get("decision") ?? "") === "approve";
  if (!postId) return { ok: false, error: "Nothing to review." };
  const result = await attempt(() =>
    decideOnPendingPost({ userId, postId, approve }),
  );
  if (result.ok) {
    revalidateFeeds(postId);
    revalidatePath("/spaces", "layout");
  }
  return result;
}

/** Re-sharing a post into another space. */
export async function sharePostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  const spaceId = String(formData.get("spaceId") ?? "");
  if (!postId || !spaceId) {
    return { ok: false, error: "Pick a space to share into." };
  }
  const result = await attempt(() =>
    sharePostToSpace({
      userId,
      postId,
      spaceId,
      note: String(formData.get("note") ?? "").slice(0, 500) || undefined,
    }),
  );
  if (result.ok) revalidateFeeds(postId);
  return result;
}

/* -------------------------------------------------------------------------- */
/* Reacting                                                                   */
/* -------------------------------------------------------------------------- */

export async function voteAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "") || undefined;
  const commentId = String(formData.get("commentId") ?? "") || undefined;
  const returnToPostId = String(formData.get("returnToPostId") ?? "") || postId;
  const raw = Number(formData.get("value"));
  const result = await attempt(() =>
    toggleVote({ userId, postId, commentId, value: raw === -1 ? -1 : 1 }),
  );
  if (result.ok) revalidateFeeds(returnToPostId);
  return result;
}

export async function reactAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return { ok: false, error: "Nothing to react to." };
  const result = await attempt(() =>
    setPostReaction({
      userId,
      postId,
      emoji: String(formData.get("emoji") ?? ""),
    }),
  );
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function reactToCommentAction(
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const commentId = String(formData.get("commentId") ?? "");
  if (!commentId) return { ok: false, error: "Nothing to react to." };
  const result = await attempt(() =>
    toggleCommentReaction({
      userId,
      commentId,
      emoji: String(formData.get("emoji") ?? ""),
    }),
  );
  if (result.ok) revalidateFeeds(String(formData.get("postId") ?? "") || undefined);
  return result;
}

export async function saveAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return { ok: false, error: "Nothing to save." };
  const result = await attempt(() => toggleBookmark(userId, postId));
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function votePollAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const result = await attempt(() =>
    votePoll(userId, String(formData.get("optionId") ?? "")),
  );
  if (result.ok) {
    revalidateFeeds(String(formData.get("postId") ?? "") || undefined);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Moderating                                                                 */
/* -------------------------------------------------------------------------- */

/** pinPost toggles on the server, so the caller does not pass a target state. */
export async function pinPostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return { ok: false, error: "Nothing to pin." };
  const result = await attempt(() => pinPost(userId, postId));
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function reportPostAction(formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return { ok: false, error: "Nothing to report." };
  const result = await attempt(() =>
    reportPost({
      userId,
      postId,
      reason: String(formData.get("reason") ?? ""),
      details: String(formData.get("details") ?? "") || undefined,
    }),
  );
  if (result.ok) revalidateFeeds(postId);
  return result;
}
