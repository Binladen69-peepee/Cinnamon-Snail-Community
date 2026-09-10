"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { awardBadges } from "@/lib/social/badges";
import {
  MessagePermissionError,
  blockMember,
  createGroupConversation,
  findOrCreateDirectConversation,
  leaveConversation,
  markConversationRead,
  reportMessage,
  sendMessage,
  unblockMember,
} from "@/lib/messages/conversations";

async function requireUserId() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  return session.user.id;
}

function messageError(error: unknown): string {
  if (error instanceof MessagePermissionError) return error.message;
  throw error;
}

async function resolveHandle(handle: string) {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: { id: true },
  });
  if (!user) throw new MessagePermissionError("That member could not be found.");
  return user.id;
}

export type MessageFormState = { error?: string };

export async function startDirectMessageAction(
  _state: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const userId = await requireUserId();
  const handle = String(formData.get("handle") ?? "").trim().replace(/^@/, "");
  let conversationId: string;
  try {
    const recipientId = await resolveHandle(handle);
    const conversation = await findOrCreateDirectConversation(userId, recipientId);
    conversationId = conversation.id;
  } catch (error) {
    return { error: messageError(error) };
  }
  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}

export async function createGroupAction(
  _state: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const userId = await requireUserId();
  const handles = formData
    .getAll("handles")
    .map((value) => String(value).trim().replace(/^@/, ""))
    .filter(Boolean);
  const title = String(formData.get("title") ?? "");
  let conversationId: string;
  try {
    const recipientIds = await Promise.all(handles.map(resolveHandle));
    const conversation = await createGroupConversation(userId, recipientIds, title);
    conversationId = conversation.id;
  } catch (error) {
    return { error: messageError(error) };
  }
  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}

export async function sendMessageAction(
  _state: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const userId = await requireUserId();
  const conversationId = String(formData.get("conversationId") ?? "");
  try {
    await sendMessage({
      conversationId,
      authorId: userId,
      body: String(formData.get("body") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
    });
  } catch (error) {
    return { error: messageError(error) };
  }
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  after(() => awardBadges(userId));
  return {};
}

export async function markReadAction(formData: FormData) {
  const userId = await requireUserId();
  const conversationId = String(formData.get("conversationId") ?? "");
  await markConversationRead(conversationId, userId);
  revalidatePath("/messages");
}

export async function blockMemberAction(formData: FormData) {
  const userId = await requireUserId();
  const targetId = String(formData.get("userId") ?? "");
  const shouldBlock = String(formData.get("block") ?? "true") === "true";
  if (shouldBlock) {
    await blockMember(userId, targetId);
  } else {
    await unblockMember(userId, targetId);
  }
  revalidatePath("/messages", "layout");
  revalidatePath("/members", "layout");
}

export async function reportMessageAction(formData: FormData) {
  const userId = await requireUserId();
  const conversationId = String(formData.get("conversationId") ?? "");
  await reportMessage({
    reporterId: userId,
    messageId: String(formData.get("messageId") ?? ""),
    reason: String(formData.get("reason") ?? "unspecified"),
    details: String(formData.get("details") ?? "") || undefined,
  });
  revalidatePath(`/messages/${conversationId}`);
}

export async function leaveConversationAction(formData: FormData) {
  const userId = await requireUserId();
  await leaveConversation(String(formData.get("conversationId") ?? ""), userId);
  revalidatePath("/messages");
  redirect("/messages");
}
