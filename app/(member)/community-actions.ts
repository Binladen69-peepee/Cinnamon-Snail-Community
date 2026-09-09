"use server";

import { revalidatePath } from "next/cache";
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

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
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
