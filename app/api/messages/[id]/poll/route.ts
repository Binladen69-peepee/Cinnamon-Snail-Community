import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  blockedAuthorIds,
  markConversationRead,
  requireMembership,
  setTyping,
} from "@/lib/messages/conversations";
import { isTyping } from "@/lib/messages/permissions";
import { previewInternalLinks } from "@/lib/messages/link-preview";
import { MessageRateLimitError } from "@/lib/messages/rate-limits";

export const dynamic = "force-dynamic";

/**
 * DEC-017: delivery is polling until a realtime vendor is wired. The client
 * asks for everything after the last message it holds, and `useMessageStream`
 * decides how often to ask.
 *
 * Membership is re-checked on every call — this is the endpoint a guessed
 * conversation id would be pointed at, and it answers 404 rather than 403 so
 * the existence of a thread is not confirmed either.
 *
 * A crew chat (DEC-078) is a room, and two things follow, the same as when
 * the thread is opened (`readConversation`):
 *
 * - Messages from anyone on either side of a block with the viewer are not
 *   theirs to read (`blockedAuthorIds`). They are left out here rather than
 *   sent and hidden by the browser, so they never reach the viewer at all —
 *   nor do their link previews, nor does "is typing" for those people.
 * - There are no read receipts. At crew size "read by everyone" never
 *   happens, and the list would be every member's reading habits.
 *
 * One-to-one and small group threads are unchanged.
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

  const crew = Boolean(membership.conversation.crew);
  const hiddenAuthorIds = crew ? await blockedAuthorIds(session.user.id) : [];

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      deletedAt: null,
      ...(hiddenAuthorIds.length ? { authorId: { notIn: hiddenAuthorIds } } : {}),
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

  // Only for the messages in this batch: a poll that returns nothing does no
  // preview work at all, which is the overwhelmingly common case.
  const previews = messages.length
    ? await previewInternalLinks({
        bodies: messages.map((message) => message.body),
        origin: url.origin,
      }).catch(() => new Map())
    : new Map();

  const hidden = new Set(hiddenAuthorIds);
  const others = membership.conversation.members.filter(
    (member) =>
      member.userId !== session.user.id && !member.leftAt && !hidden.has(member.userId),
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
      readReceipts: crew
        ? []
        : others.map((member) => ({
            name: member.user.profile?.displayName ?? member.user.handle,
            lastReadAt: member.lastReadAt?.toISOString() ?? null,
          })),
      previews: [...previews.values()],
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
  try {
    await setTyping(id, session.user.id);
  } catch (error) {
    // Over the limit. A typing flag is the least important thing in the
    // system, so it is dropped quietly rather than surfaced to the sender.
    if (error instanceof MessageRateLimitError) {
      return Response.json(
        { ok: false },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
