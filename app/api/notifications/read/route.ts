import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Marks one notification read when its push notification is clicked.
 *
 * The service worker calls this before opening the page, so a notification
 * read from the lock screen is not still sitting unread in the inbox. Same
 * rules as opening it from the inbox: the session decides whose it is, an id
 * that is not yours changes nothing and reveals nothing, and it is POST-only
 * so nothing that merely fetches a URL can mark anything.
 */
export async function POST(request: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user.id) return new Response(null, { status: 401 });

  const limit = await consumeRateLimit(`notif-read:${session.user.id}`, 240, 60 * 1000);
  if (!limit.ok) return new Response(null, { status: 429 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.slice(0, 64) : "";
  if (!id) return new Response(null, { status: 400 });

  await prisma.notification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return new Response(null, { status: 204 });
}
