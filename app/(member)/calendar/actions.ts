"use server";

import { revalidatePath } from "next/cache";
import type { RsvpStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { canRsvp, getEventViewer } from "@/lib/events/access";
import { RsvpError, setRsvp, type RsvpOutcome } from "@/lib/events/rsvp";

/**
 * Answering an invitation.
 *
 * The member id comes from the session and never from the argument, the event
 * is re-checked against the same gate the page used, and the write itself is
 * serialised per event inside `setRsvp`. A server action is a public endpoint:
 * the button being hidden is not a control.
 */

export type RsvpResult =
  | { ok: true; outcome: RsvpOutcome }
  | { ok: false; error: string };

const ALLOWED: RsvpStatus[] = ["GOING", "WAITLIST", "NOT_GOING"];

export async function rsvpAction(
  eventId: string,
  status: RsvpStatus,
): Promise<RsvpResult> {
  const session = await auth();
  if (!session?.user.id) return { ok: false, error: "Sign in first." };

  if (!ALLOWED.includes(status)) {
    return { ok: false, error: "That is not an answer." };
  }

  // Far above what a person does by hand, and low enough that a stuck button
  // cannot hammer the row lock.
  const limit = await consumeRateLimit(
    `event-rsvp:${session.user.id}`,
    60,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return { ok: false, error: "That is a lot of changes at once. Try again shortly." };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, spaceId: true, status: true, startsAt: true },
  });
  if (!event) return { ok: false, error: "That event is gone." };

  const viewer = await getEventViewer(session.user.id);
  if (!viewer) return { ok: false, error: "Sign in first." };
  if (!canRsvp(viewer, event)) {
    return {
      ok: false,
      error:
        event.startsAt.getTime() <= Date.now()
          ? "That event has already happened."
          : "You cannot RSVP to that event.",
    };
  }

  try {
    const outcome = await setRsvp({
      userId: session.user.id,
      eventId,
      status,
    });
    revalidatePath("/calendar");
    revalidatePath(`/calendar/${event.slug}`);
    revalidatePath("/home");
    return { ok: true, outcome };
  } catch (error) {
    if (error instanceof RsvpError) {
      return { ok: false, error: error.message };
    }
    console.error("[events] rsvp failed");
    return { ok: false, error: "That did not save. Try again." };
  }
}
