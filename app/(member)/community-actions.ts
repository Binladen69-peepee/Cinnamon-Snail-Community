"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { PostType } from "@prisma/client";
import { auth } from "@/auth";
import {
  addComment,
  createPost,
  pinPost,
  reportPost,
  setPostReaction,
  toggleBookmark,
  votePoll,
} from "@/lib/community/posts";
import { toggleVote } from "@/lib/community/votes";
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
      }[];
    }
  | { ok: false; error: string }
> {
  if (claimed.length === 0) return { ok: true, files: [] };

  const files: {
    url: string;
    kind: string;
    alt?: string;
    mimeType?: string;
    width?: number | null;
    height?: number | null;
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

    files.push({
      url,
      kind,
      alt: alt || undefined,
      // The stored type wins over whatever the client claimed.
      mimeType: verified.mimeType,
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
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

    await createPost({
      userId,
      spaceId,
      type,
      title: title || undefined,
      body,
      status: "PUBLISHED",
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

export async function commentAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !body) return;
  await addComment({
    userId,
    postId,
    body,
    parentId: String(formData.get("parentId") ?? "") || undefined,
  });
  revalidateFeeds(postId);
  after(() => awardBadges(userId));
}

/* -------------------------------------------------------------------------- */
/* Reacting                                                                   */
/* -------------------------------------------------------------------------- */

export async function voteAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "") || undefined;
  const commentId = String(formData.get("commentId") ?? "") || undefined;
  const returnToPostId = String(formData.get("returnToPostId") ?? "") || postId;
  const raw = Number(formData.get("value"));
  await toggleVote({ userId, postId, commentId, value: raw === -1 ? -1 : 1 });
  revalidateFeeds(returnToPostId);
}

export async function reactAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return;
  await setPostReaction({
    userId,
    postId,
    emoji: String(formData.get("emoji") ?? ""),
  });
  revalidateFeeds(postId);
}

export async function saveAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return;
  await toggleBookmark(userId, postId);
  revalidateFeeds(postId);
}

export async function votePollAction(formData: FormData) {
  const userId = await requireUserId();
  await votePoll(userId, String(formData.get("optionId") ?? ""));
  revalidateFeeds(String(formData.get("postId") ?? "") || undefined);
}

/* -------------------------------------------------------------------------- */
/* Moderating                                                                 */
/* -------------------------------------------------------------------------- */

/** pinPost toggles on the server, so the caller does not pass a target state. */
export async function pinPostAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return;
  await pinPost(userId, postId);
  revalidateFeeds(postId);
}

export async function reportPostAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "");
  if (!postId) return;
  await reportPost(
    userId,
    postId,
    String(formData.get("reason") ?? "").slice(0, 500),
  );
  revalidateFeeds(postId);
  redirect(`/posts/${postId}`);
}
