import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { eventIcs } from "@/lib/learn/events";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return new Response("Sign in required.", { status: 401 });
  }
  const { id } = await context.params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return new Response("Not found.", { status: 404 });
  return new Response(eventIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.id}.ics"`,
    },
  });
}
