"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOOK_COOKIE, parseLook } from "@/lib/looks";

/**
 * Choose a candidate identity, or clear back to the current theme.
 *
 * A server action rather than writing document.cookie from the switcher: the
 * server reads this cookie when it renders the shell, so the server should own
 * it. It also keeps the lint rule about mutating things outside a component
 * satisfied without arguing with its heuristic.
 *
 * Scaffolding. Goes when a look is chosen.
 */
export async function setLookAction(value: string) {
  const look = parseLook(value);
  const store = await cookies();

  if (!look) {
    store.delete(LOOK_COOKIE);
  } else {
    store.set(LOOK_COOKIE, look, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
  }

  // Every member surface reads it, so invalidate the whole group.
  revalidatePath("/", "layout");
}
