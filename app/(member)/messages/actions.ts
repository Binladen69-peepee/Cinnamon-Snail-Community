"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  blockMember,
  createGroupConversation,
  findOrCreateDirectConversation,
  leaveConversation,
  MessagePermissionError,
  reportMessage,
  sendMessage,
  unblockMember,
} from "@/lib/messages/conversations";
import { prisma } from "@/lib/db";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";

type Result = { ok: true } | { ok: false; error: string };

function failed(error: unknown): Result {
  if (error instanceof MessagePermissionError) {
    return { ok: false, error: error.message };
  }
  throw error;
}

/**
 * An image on a message must be a file this member just uploaded to our own
 * bucket. Without this the column is an open redirect into any host — the same
 * check `community-actions.ts` runs on post attachments, for the same reason.
 */
async function verifyImage(
  userId: string,
  raw: string | null,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  if (!raw) return { ok: true, url: null };
  const path = objectPathFromUrl(raw);
  if (!path) return { ok: false, error: "That image is not one of ours." };
  const verified = await verifyUploaded({ userId, path });
  if (!verified.ok) return { ok: false, error: verified.error };
  if (!verified.mimeType?.startsWith("image/")) {
    return { ok: false, error: "Only images can be attached to a message." };
  }
  return { ok: true, url: raw };
}

export async function sendMessageAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in required." };

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const rawImage = String(formData.get("imageUrl") ?? "").trim() || null;
  if (!conversationId) return { ok: false, error: "Missing conversation." };

  const image = await verifyImage(session.user.id, rawImage);
  if (!image.ok) return { ok: false, error: image.error };

  try {
    await sendMessage({
      conversationId,
      authorId: session.user.id,
      body,
      imageUrl: image.url,
    });
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  return { ok: true };
}

/**
 * Opens a thread with one member, or creates a group with several.
 *
 * Redirects rather than returning the id, so the new thread is a real URL the
 * back button understands.
 */
export async function startConversationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const handles = formData
    .getAll("handle")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (handles.length === 0) {
    redirect("/messages/new?error=pick");
  }

  const users = await prisma.user.findMany({
    where: { handle: { in: handles } },
    select: { id: true },
  });
  if (users.length !== handles.length) {
    redirect("/messages/new?error=missing");
  }

  const title = String(formData.get("title") ?? "").trim() || null;
  let conversationId: string;
  try {
    if (users.length === 1) {
      const conversation = await findOrCreateDirectConversation(
        session.user.id,
        users[0].id,
      );
      conversationId = conversation.id;
    } else {
      const conversation = await createGroupConversation(
        session.user.id,
        users.map((user) => user.id),
        title,
      );
      conversationId = conversation.id;
    }
  } catch (error) {
    if (error instanceof MessagePermissionError) {
      redirect(`/messages/new?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}

export async function blockMemberAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in required." };
  const handle = String(formData.get("handle") ?? "").trim();
  const target = await prisma.user.findUnique({
    where: { handle },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "That member could not be found." };

  const unblocking = String(formData.get("unblock") ?? "") === "1";
  try {
    if (unblocking) await unblockMember(session.user.id, target.id);
    else await blockMember(session.user.id, target.id);
  } catch (error) {
    return failed(error);
  }
  revalidatePath("/messages");
  return { ok: true };
}

export async function reportMessageAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in required." };
  const messageId = String(formData.get("messageId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!messageId || !reason) {
    return { ok: false, error: "Tell us what is wrong with it." };
  }
  try {
    await reportMessage({
      reporterId: session.user.id,
      messageId,
      reason,
      details: String(formData.get("details") ?? "").trim() || undefined,
    });
  } catch (error) {
    return failed(error);
  }
  return { ok: true };
}

export async function leaveConversationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  if (conversationId) {
    await leaveConversation(conversationId, session.user.id);
  }
  revalidatePath("/messages");
  redirect("/messages");
}
