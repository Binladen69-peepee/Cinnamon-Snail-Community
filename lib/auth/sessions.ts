import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

/**
 * The revocation list.
 *
 * Sessions are JWTs, which are unrevokable on their own: the server does not
 * see them again until they are presented. What makes them revokable is the
 * Session row each token points at, and these two functions are the only
 * things that strike one off. The token callback re-checks the row on a
 * bounded interval, so a revocation takes effect within that window.
 *
 * This lives apart from `auth.ts` deliberately. Everything that revokes —
 * signing out, resetting a password, changing one, an admin removing someone —
 * would otherwise have to import the whole Auth.js runtime to do a two-line
 * database write.
 */
export async function revokeSession(sessionId: string, actorId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    actorId,
    action: "auth.session.revoked",
    targetType: "session",
    targetId: sessionId,
  });
}

/** Ends every live session a member has, on every device. */
export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    actorId: userId,
    action: "auth.session.revoked_all",
    targetType: "user",
    targetId: userId,
  });
}
