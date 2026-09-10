import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  markConversationRead,
  requireMembership,
  setTyping,
} from "@/lib/messages/conversations";
import { isTyping } from "@/lib/messages/permissions";

export const dynamic = "force-dynamic";

/**
 * DEC-016: delivery is short-interval polling until a realtime vendor is wired.
 * The client asks for everything after the last message it holds.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  const membership = await requireMembership(id, session.user.id);
  if (!membership) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : null;
  const validSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : null;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      deletedAt: null,
      ...(validSince ? { createdAt: { gt: validSince } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      author: {
        select: {
          id: true,
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  });

  if (url.searchParams.get("read") === "1" && messages.length > 0) {
    await markConversationRead(id, session.user.id);
  }

  const others = membership.conversation.members.filter(
    (member) => member.userId !== session.user.id && !member.leftAt,
  );

  return Response.json(
    {
      messages: messages.map((message) => ({
        id: message.id,
        body: message.body,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt.toISOString(),
        authorId: message.authorId,
        authorName: message.author.profile?.displayName ?? message.author.handle,
        authorAvatar: message.author.profile?.avatarUrl ?? null,
        mine: message.authorId === session.user.id,
      })),
      typing: others
        .filter((member) => isTyping(member.typingAt))
        .map((member) => member.user.profile?.displayName ?? member.user.handle),
      readReceipts: others.map((member) => ({
        name: member.user.profile?.displayName ?? member.user.handle,
        lastReadAt: member.lastReadAt?.toISOString() ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Typing ping. Throttled by the client; the flag expires on its own. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  const membership = await requireMembership(id, session.user.id);
  if (!membership) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  await setTyping(id, session.user.id);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
