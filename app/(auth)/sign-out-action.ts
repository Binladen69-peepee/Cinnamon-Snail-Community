"use server";

import { auth, signOut, revokeSession, revokeAllSessions } from "@/auth";

/**
 * Signing out, for real.
 *
 * Clearing the cookie ends the session in this browser but leaves the Session
 * row alive, so a copy of the token taken beforehand would still pass the
 * revocation check. Revoking the row first is what makes the blacklist mean
 * something at the one moment a member expects it to.
 */
export async function signOutAction() {
  const session = await auth();
  if (session?.sessionId && session.user?.id) {
    await revokeSession(session.sessionId, session.user.id).catch(
      () => undefined,
    );
  }
  await signOut({ redirectTo: "/" });
}

/** Ends every session this member has anywhere, then this one. */
export async function signOutEverywhereAction() {
  const session = await auth();
  if (session?.user?.id) {
    await revokeAllSessions(session.user.id).catch(() => undefined);
  }
  await signOut({ redirectTo: "/" });
}
