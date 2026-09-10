"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { rsvpToEvent } from "@/lib/learn/events";

export async function rsvpAction(formData: FormData) {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  await rsvpToEvent({
    userId: session.user.id,
    eventId: String(formData.get("eventId")),
    status: String(formData.get("status")) === "not_going" ? "not_going" : "going",
  });
  revalidatePath("/calendar");
}
