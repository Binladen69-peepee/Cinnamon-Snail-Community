"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
import { PostType } from "@prisma/client";
import { redirect } from "next/navigation";
import { awardBadges } from "@/lib/social/badges";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";
import { kindOf } from "@/lib/uploads/policy";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

/**
 * Post straight from the feed, with no navigation.
 *
 * `createPostAction` redirects when it is done, which is right for the full
 * compose page and wrong for the inline composer — a redirect throws the reader
 * back to the top of the feed and loses their scroll position. This one just
 * revalidates, so the new post appears in place.
 *
 * Returns a plain result rather than throwing, so the composer can show the
 * reason inline instead of tripping an error boundary over a typo.
 */
/**
 * Check every claimed attachment against what is actually in the bucket.
 *
 * The client tells us a URL, a size and a type; none of that is evidence. This
 * re-reads each object's stored metadata, which is what catches a member who
 * asked for a URL for a 1 KB image and then uploaded an 80 MB file, and it
 * rejects any path that does not sit under their own user id.
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
      // The stored type wins over whatever the client said it was.
      mimeType: verified.mimeType,
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
    });
  }

  return { ok: true, files };
}

export async function createFeedPostAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId();
    const body = String(formData.get("body") ?? "").trim();

    // Attachments arrive as JSON because FormData cannot carry a nested list.
    // Every entry is re-verified against storage below, so this is a claim
    // about what was uploaded, not a trusted record.
    let claimed: unknown[] = [];
    const rawAttachments = String(formData.get("attachments") ?? "");
    if (rawAttachments) {
      try {
        const parsed = JSON.parse(rawAttachments);
        if (Array.isArray(parsed)) claimed = parsed.slice(0, 8);
      } catch {
        return { ok: false, error: "Those attachments could not be read." };
      }
    }

    // A photo on its own is a perfectly good post; text is only required when
    // there is nothing else.
    if (!body && claimed.length === 0) {
      return { ok: false, error: "Write something or add a photo first." };
    }

    const spaceId = String(formData.get("spaceId") ?? "");
    if (!spaceId) return { ok: false, error: "Pick a space to post in." };

    const rawType = String(formData.get("type") ?? "SIMPLE");
    const type = (Object.values(PostType) as string[]).includes(rawType)
      ? (rawType as PostType)
      : "SIMPLE";

    const title = String(formData.get("title") ?? "").trim();

    const attachments = await verifyAttachments(userId, claimed);
    if (!attachments.ok) return { ok: false, error: attachments.error };

    await createPost({
      userId,
      spaceId,
      type,
      title: title || undefined,
      body,
      status: "PUBLISHED",
      attachmentUrls: attachments.files,
    });

    revalidatePath("/home");
    revalidatePath("/spaces", "layout");
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

export async function createPostAction(formData: FormData) {
  const userId = await requireUserId();
  const type = String(formData.get("type") ?? "SIMPLE") as PostType;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const gifUrl = String(formData.get("gifUrl") ?? "").trim();
  const poll = [1, 2, 3, 4]
    .map((index) => String(formData.get(`poll${index}`) ?? "").trim())
    .filter(Boolean);
  const status = String(formData.get("status") ?? "PUBLISHED");
  const scheduled = String(formData.get("scheduledAt") ?? "");
  const post = await createPost({
    userId,
    spaceId: String(formData.get("spaceId")),
    type,
    title: String(formData.get("title") ?? "") || undefined,
    body: String(formData.get("body") ?? ""),
    linkUrl: String(formData.get("linkUrl") ?? "") || undefined,
    status: status === "DRAFT" ? "DRAFT" : scheduled ? "SCHEDULED" : "PUBLISHED",
    scheduledAt: scheduled ? new Date(scheduled) : null,
    pollOptions: type === "POLL" ? poll : undefined,
    attachmentUrls: [
      ...(imageUrl ? [{ url: imageUrl, kind: "image" }] : []),
      ...(gifUrl ? [{ url: gifUrl, kind: "gif" }] : []),
    ],
  });
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
  // Recognition is checked off the request path so posting stays fast.
  after(() => awardBadges(userId));
  if (post.status === "PUBLISHED") {
    redirect(`/posts/${post.id}`);
  }
  redirect("/home");
}

export async function commentAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId"));
  await addComment({
    userId,
    postId,
    body: String(formData.get("body") ?? ""),
    parentId: String(formData.get("parentId") ?? "") || undefined,
  });
  revalidatePath(`/posts/${postId}`);
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
  after(() => awardBadges(userId));
}

export async function voteAction(formData: FormData) {
  const userId = await requireUserId();
  const postId = String(formData.get("postId") ?? "") || undefined;
  const commentId = String(formData.get("commentId") ?? "") || undefined;
  const returnToPostId = String(formData.get("returnToPostId") ?? "") || postId;
  const raw = Number(formData.get("value"));
  const value = raw === -1 ? -1 : 1;
  await toggleVote({ userId, postId, commentId, value });
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
  if (returnToPostId) revalidatePath(`/posts/${returnToPostId}`);
}

export async function saveAction(formData: FormData) {
  const userId = await requireUserId();
  await toggleBookmark(userId, String(formData.get("postId")));
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
}

export async function reportAction(formData: FormData) {
  const userId = await requireUserId();
  await reportPost(
    userId,
    String(formData.get("postId")),
    String(formData.get("reason") ?? "unspecified"),
  );
}

export async function pinAction(formData: FormData) {
  const userId = await requireUserId();
  await pinPost(userId, String(formData.get("postId")));
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
}

export async function reactAction(formData: FormData) {
  const userId = await requireUserId();
  await setPostReaction({
    userId,
    postId: String(formData.get("postId")),
    emoji: String(formData.get("emoji") ?? ""),
  });
  revalidatePath("/home");
  revalidatePath("/spaces", "layout");
}

export async function votePollAction(formData: FormData) {
  const userId = await requireUserId();
  await votePoll(userId, String(formData.get("optionId")));
  revalidatePath("/home");
}
