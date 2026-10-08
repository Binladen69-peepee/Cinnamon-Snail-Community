"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  blockMember,
  createGroupConversation,
  findOrCreateDirectConversation,
  leaveConversation,
  loadOlderMessages,
  MessagePermissionError,
  reportMessage,
  sendMessage,
  unblockMember,
} from "@/lib/messages/conversations";
import { previewInternalLinks } from "@/lib/messages/link-preview";
import { resolveMemberAvatar } from "@/lib/community/member-avatars";
import { prisma } from "@/lib/db";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";
import { MessageRateLimitError } from "@/lib/messages/rate-limits";
import { markMatchMessaged } from "@/lib/social/suggestions";
import { track } from "@/lib/analytics/server";
import { isReportReason } from "@/lib/community/report-reasons";

type Result = { ok: true } | { ok: false; error: string };

function failed(error: unknown): Result {
  if (
    error instanceof MessagePermissionError ||
    error instanceof MessageRateLimitError
  ) {
    // Both are things the member can understand and act on, so they come back
    // as a message under the composer rather than as a thrown 500.
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
  // Bounded: it is a client-supplied key that becomes a unique index entry.
  const clientId = String(formData.get("clientId") ?? "").trim().slice(0, 64) || null;
  if (!conversationId) return { ok: false, error: "Missing conversation." };

  const image = await verifyImage(session.user.id, rawImage);
  if (!image.ok) return { ok: false, error: image.error };

  try {
    await sendMessage({
      conversationId,
      authorId: session.user.id,
      body,
      imageUrl: image.url,
      clientId,
    });
  } catch (error) {
    return failed(error);
  }

  // The weekly match's suggested opener was in the box when this was sent:
  // the match now shows as messaged. Scoped to the sender's own match.
  const draftKey = String(formData.get("draftKey") ?? "").trim().slice(0, 80);
  if (draftKey) {
    await markMatchMessaged({ viewerId: session.user.id, draftKey, conversationId }).catch(
      () => undefined,
    );
    revalidatePath("/connect");
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  // Only that a message was sent: never its text, recipient or conversation.
  track(session.user.id, "message_sent", { has_image: image.url !== null });
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
  if (!messageId || !isReportReason(reason)) {
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

/**
 * The page of messages above the ones already on screen.
 *
 * A thread opens on its newest page — it used to open on the oldest two
 * hundred, which meant a long conversation never showed anything recent — so
 * scrolling up asks for more. Keyed on the oldest message the client holds
 * rather than on an offset, because a thread gains messages while somebody
 * reads back through it.
 */
export async function loadOlderMessagesAction(input: {
  conversationId: string;
  before: string;
}) {
  const session = await auth();
  if (!session?.user.id) return { ok: false as const, error: "Sign in required." };

  const page = await loadOlderMessages({
    conversationId: input.conversationId,
    userId: session.user.id,
    before: input.before,
  });
  // Null means "not a member", which is the same answer as "no such thread".
  if (!page) return { ok: false as const, error: "This conversation is not available." };

  const previews = await previewInternalLinks({
    bodies: page.messages.map((message) => message.body),
    origin: "",
  }).catch(() => new Map());

  return {
    ok: true as const,
    hasMore: page.hasMore,
    previews: [...previews.values()],
    messages: page.messages.map((message) => ({
      id: message.id,
      body: message.body,
      imageUrl: message.imageUrl,
      createdAt: message.createdAt.toISOString(),
      authorId: message.authorId,
      authorName: message.author.profile?.displayName ?? message.author.handle,
      authorAvatar: resolveMemberAvatar(
        message.author.handle,
        message.author.profile?.avatarUrl,
        message.author.profile?.displayName,
      ),
      mine: message.authorId === session.user.id,
    })),
  };
}
