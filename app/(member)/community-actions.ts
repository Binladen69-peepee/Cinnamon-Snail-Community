"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { PostStatus, PostType } from "@prisma/client";
import { auth } from "@/auth";
import {
  addComment,
  createPost,
  decideOnPendingPost,
  deleteComment,
  deletePost,
  pinPost,
  publishPost,
  updatePost,
} from "@/lib/community/posts";
import {
  parseReactionMode,
  reportPost,
  setPostReaction,
  toggleCommentReaction,
  votePoll,
} from "@/lib/community/engagement";
import { setPin } from "@/lib/community/pins";
import { toggleVote } from "@/lib/community/votes";
import { guardCommunityAction } from "@/lib/community/rate-limits";
import { ensureKitchenTableSeat, hasHostRole } from "@/lib/community/kitchen-table";
import {
  isStaffOnlyType,
  parseAcceptedPostType,
  POST_BODY_MAX,
  POST_TITLE_MAX,
} from "@/lib/community/post-types";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";
import { awardBadges } from "@/lib/social/badges";
import { track } from "@/lib/analytics/server";
import { kindOf } from "@/lib/uploads/policy";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";

const SIGN_IN = "You need to sign in.";

/** The signed-in member, or null. Actions answer a missing session in words. */
async function viewer() {
  const session = await auth();
  return session?.user.id ? session.user : null;
}

/**
 * An id read from a form, or "" when it is missing or is not shaped like one
 * of ours. Every id is re-checked against the database by the domain layer;
 * this only stops junk reaching it.
 */
function readId(formData: FormData, key: string): string {
  const raw = String(formData.get(key) ?? "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : "";
}

/**
 * Paths whose content changes when a post or a comment does. Kept in one place
 * so a new surface cannot be added without its cache being considered.
 *
 * Per-member toggles (a reaction, a pin, a vote) deliberately do not call
 * this: the control that changed already shows the change, and re-rendering
 * the whole Kitchen Table for each one is slow and moves the page under the
 * reader's thumb.
 */
function revalidateFeeds(postId?: string) {
  revalidatePath(KITCHEN_TABLE_PATH);
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

export type CreatePostResult =
  | {
      ok: true;
      postId: string;
      /** Where it landed: live, held for a host, scheduled, or kept as a draft. */
      status: PostStatus;
      scheduledAt: string | null;
    }
  | { ok: false; error: string };

/**
 * Post to the Kitchen Table, with no navigation.
 *
 * Every post goes to the Kitchen Table (DEC-078). A `spaceId` sent by an older
 * client is ignored rather than trusted: there is no space picker any more,
 * and the room a post lands in decides who can read it.
 *
 * Returns a result rather than throwing, so the composer shows the reason
 * inline instead of tripping an error boundary over a typo, and says where the
 * post went when it did not go live (held for review, scheduled).
 */
export async function createPostAction(formData: FormData): Promise<CreatePostResult> {
  try {
    const user = await viewer();
    if (!user) return { ok: false, error: SIGN_IN };
    const userId = user.id;
    const body = String(formData.get("body") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();

    if (body.length > POST_BODY_MAX) {
      return { ok: false, error: `Posts can be up to ${POST_BODY_MAX.toLocaleString()} characters.` };
    }
    if (title.length > POST_TITLE_MAX) {
      return { ok: false, error: "That title is too long." };
    }

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

    // Only the types the composer offers (plus IMAGE and VIDEO, inferred from
    // what was attached). IDEA and BULLETIN are written by their own boards.
    const rawType = String(formData.get("type") ?? "");
    const explicit = rawType ? parseAcceptedPostType(rawType) : null;
    if (rawType && !explicit) {
      return { ok: false, error: "That kind of post cannot be made here." };
    }
    if (explicit && isStaffOnlyType(explicit) && !hasHostRole(user.roles)) {
      return {
        ok: false,
        error:
          "Live classes are scheduled by the team. Planning a get-together? Post it on the Bulletin Board.",
      };
    }

    const attachments = await verifyAttachments(userId, claimed);
    if (!attachments.ok) return { ok: false, error: attachments.error };

    // The type follows what was attached unless the composer said otherwise, so
    // the feed can frame it correctly.
    const hasVideo = attachments.files.some((file) => file.kind === "video");
    const type: PostType =
      explicit ??
      (hasVideo ? "VIDEO" : attachments.files.length > 0 ? "IMAGE" : "SIMPLE");

    const poll = [1, 2, 3, 4]
      .map((n) => String(formData.get(`poll${n}`) ?? "").trim().slice(0, 120))
      .filter(Boolean);
    if (type === "POLL" && poll.length < 2) {
      return { ok: false, error: "A poll needs at least two options." };
    }

    // Only http(s) is allowed through: the value is rendered as an href, and a
    // `javascript:` string in that position is the whole of the attack.
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

    // The composer can ask for a scheduled post; anything else is published
    // now, subject to whatever the room says about approval. "DRAFT" is still
    // honoured for older clients, though the composer no longer offers it.
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

    // A live class needs a time, and a recipe needs a method. Both are read
    // here and checked here, because both write a row of their own.
    let event: Parameters<typeof createPost>[0]["event"] = null;
    if (type === "EVENT") {
      const startsAt = new Date(String(formData.get("startsAt") ?? ""));
      if (Number.isNaN(startsAt.getTime())) {
        return { ok: false, error: "A live class needs a start time." };
      }
      const rawEnd = String(formData.get("endsAt") ?? "").trim();
      const endsAt = rawEnd ? new Date(rawEnd) : null;
      if (endsAt && Number.isNaN(endsAt.getTime())) {
        return { ok: false, error: "That end time is not one we can read." };
      }
      if (endsAt && endsAt <= startsAt) {
        return { ok: false, error: "A class cannot end before it starts." };
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
        location: String(formData.get("location") ?? "").trim().slice(0, 200) || null,
        zoomUrl,
        capacity:
          Number.isFinite(rawCapacity) && rawCapacity > 0
            ? Math.min(Math.trunc(rawCapacity), 100_000)
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

    // Every member sits at the Kitchen Table; this gives the seat back to
    // anyone who left the room while rooms were still listed.
    const spaceId = await ensureKitchenTableSeat(userId);

    const post = await createPost({
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
    if (post.status !== "PUBLISHED") revalidatePath("/drafts");
    // Recognition is checked off the request path so posting stays fast.
    after(() => awardBadges(userId));
    track(userId, "post_created", {
      post_type: type,
      has_media: attachments.files.length > 0,
      scheduled: scheduledAt !== null,
    });
    return {
      ok: true,
      postId: post.id,
      status: post.status,
      scheduledAt: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That did not post.",
    };
  }
}

export async function commentAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !body) {
    return { ok: false, error: "Write something first." };
  }
  if (body.length > POST_BODY_MAX) {
    return { ok: false, error: "That comment is too long." };
  }
  const parentId = readId(formData, "parentId") || null;
  const result = await attempt(() =>
    addComment({ userId: user.id, postId, body, parentId }),
  );
  if (result.ok) {
    revalidateFeeds(postId);
    after(() => awardBadges(user.id));
    track(user.id, "comment_created", { is_reply: Boolean(parentId) });
  }
  return result;
}

/** Editing a post in place. */
export async function updatePostAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !body) {
    return { ok: false, error: "A post needs something in it." };
  }
  if (body.length > POST_BODY_MAX) {
    return { ok: false, error: "That post is too long." };
  }
  const result = await attempt(() =>
    updatePost({
      userId: user.id,
      postId,
      title: String(formData.get("title") ?? "").trim().slice(0, POST_TITLE_MAX) || null,
      body,
      linkUrl: String(formData.get("linkUrl") ?? "").trim() || null,
    }),
  );
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function deletePostAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  if (!postId) return { ok: false, error: "Nothing to remove." };
  const result = await attempt(() => deletePost({ userId: user.id, postId }));
  if (result.ok) {
    revalidateFeeds(postId);
    revalidatePath("/drafts");
  }
  return result;
}

export async function deleteCommentAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const commentId = readId(formData, "commentId");
  const postId = readId(formData, "postId");
  if (!commentId) return { ok: false, error: "Nothing to remove." };
  const result = await attempt(() => deleteComment({ userId: user.id, commentId }));
  if (result.ok) revalidateFeeds(postId || undefined);
  return result;
}

/** Sends a draft live, or an approved post on its way. */
export async function publishPostAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  if (!postId) return { ok: false, error: "Nothing to publish." };
  const result = await attempt(() => publishPost({ userId: user.id, postId }));
  if (result.ok) {
    revalidateFeeds(postId);
    revalidatePath("/drafts");
  }
  return result;
}

/** A host letting a held post through, or turning it away. */
export async function reviewPostAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  const approve = String(formData.get("decision") ?? "") === "approve";
  if (!postId) return { ok: false, error: "Nothing to review." };
  const result = await attempt(() =>
    decideOnPendingPost({ userId: user.id, postId, approve }),
  );
  if (result.ok) {
    revalidateFeeds(postId);
    revalidatePath("/spaces/[slug]/review", "page");
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Reacting                                                                   */
/* -------------------------------------------------------------------------- */

export async function voteAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId") || undefined;
  const commentId = readId(formData, "commentId") || undefined;
  if (!postId && !commentId) return { ok: false, error: "Nothing to vote on." };
  const raw = Number(formData.get("value"));
  return attempt(() =>
    toggleVote({ userId: user.id, postId, commentId, value: raw === -1 ? -1 : 1 }),
  );
}

/**
 * Setting or clearing this member's reaction.
 *
 * The control sends what it wants the reaction to be (`intent` of `set` or
 * `clear`), not "toggle whatever is there", so a card showing a stale state
 * can never turn a like into an unlike.
 */
export async function reactAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  if (!postId) return { ok: false, error: "Nothing to react to." };
  return attempt(() =>
    setPostReaction({
      userId: user.id,
      postId,
      emoji: String(formData.get("emoji") ?? "").slice(0, 16),
      mode: parseReactionMode(formData.get("intent")),
    }),
  );
}

export async function reactToCommentAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const commentId = readId(formData, "commentId");
  if (!commentId) return { ok: false, error: "Nothing to react to." };
  return attempt(() =>
    toggleCommentReaction({
      userId: user.id,
      commentId,
      emoji: String(formData.get("emoji") ?? "").slice(0, 16),
    }),
  );
}

/**
 * "Pin this post" / "Unpin" (DEC-078).
 *
 * Takes the state the member asked for, never a toggle: pressing Pin twice
 * leaves the post pinned. See `lib/community/pins.ts` for why that matters.
 */
export async function setPinAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  if (!postId) return { ok: false, error: "Nothing to pin." };
  const pinned = String(formData.get("pinned") ?? "") === "true";
  return attempt(() => setPin(user.id, postId, pinned));
}

export async function votePollAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const optionId = readId(formData, "optionId");
  if (!optionId) return { ok: false, error: "Pick an option." };
  return attempt(() => votePoll(user.id, optionId));
}

/* -------------------------------------------------------------------------- */
/* Moderating                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Making a post an announcement, or taking it down again: the team's pin,
 * shown to everyone at the top of the Kitchen Table. `pinPost` toggles on the
 * server and checks that the member moderates the post's room.
 */
export async function pinPostAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  if (!postId) return { ok: false, error: "Nothing to pin." };
  const result = await attempt(() => pinPost(user.id, postId));
  if (result.ok) revalidateFeeds(postId);
  return result;
}

export async function reportPostAction(formData: FormData): Promise<ActionResult> {
  const user = await viewer();
  if (!user) return { ok: false, error: SIGN_IN };
  const postId = readId(formData, "postId");
  if (!postId) return { ok: false, error: "Nothing to report." };
  return attempt(() =>
    reportPost({
      userId: user.id,
      postId,
      reason: String(formData.get("reason") ?? ""),
      details: String(formData.get("details") ?? "").slice(0, 500) || undefined,
    }),
  );
}
