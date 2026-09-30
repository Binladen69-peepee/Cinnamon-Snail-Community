import * as Sentry from "@sentry/nextjs";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

/**
 * Sends one harmless, clearly labelled error to Sentry and returns its event
 * id, so staff can confirm monitoring works in a deployment without breaking a
 * page to do it. Staff only; everyone else gets a 404, as if it did not exist.
 */
export async function POST() {
  const session = await auth().catch(() => null);
  const isStaff = Boolean(
    session?.user.roles?.some((role) => role === "ADMIN" || role === "SUPER_ADMIN"),
  );
  if (!isStaff) return new Response(null, { status: 404 });

  const eventId = Sentry.captureException(
    new Error("Sentry test error (safe, sent from /api/admin/sentry-test)"),
    { tags: { area: "sentry-test" }, level: "info" },
  );
  const delivered = await Sentry.flush(5000);
  return Response.json({ eventId, delivered, enabled: Boolean(Sentry.getClient()?.getOptions().enabled) });
}
