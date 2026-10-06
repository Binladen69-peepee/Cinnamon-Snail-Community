"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { fromLocalInputValue, safeTimeZone } from "@/lib/events/timezone";
import { awardBadges } from "@/lib/social/badges";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";
import {
  BulletinError,
  cancelHappening,
  createHappening,
  decideRsvp,
  deleteServiceCard,
  requestRsvp,
  saveServiceCard,
  saveTestimonial,
  submitPlace,
  withdrawRsvp,
  type BulletinTab,
} from "@/lib/bulletin";

/**
 * Bulletin Board form actions. Plain forms, so each works before hydration.
 *
 * Every one re-reads the session: a server action is a public endpoint, and
 * the page being behind a login proves nothing about who is posting to it.
 * Refusals come back as a code the page turns into text, never as text.
 */

async function viewerOrLogin() {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/bulletin");
  return session.user.id;
}

async function run(
  tab: BulletinTab,
  work: (userId: string) => Promise<string | void>,
  options: { limit?: number } = {},
) {
  const userId = await viewerOrLogin();
  // Writing to the board is rarer than clicking around it, so the ceiling is
  // lower than elsewhere; it exists so a stuck button cannot post a hundred.
  const limit = await consumeRateLimit(`bulletin:${userId}`, options.limit ?? 40, 10 * 60 * 1000);
  const base = tab === "happenings" ? "/bulletin" : `/bulletin?tab=${tab}`;
  const join = base.includes("?") ? "&" : "?";
  if (!limit.ok) redirect(`${base}${join}error=busy`);

  let code: string | null = null;
  let notice = "";
  try {
    notice = (await work(userId)) ?? "";
  } catch (error) {
    if (error instanceof BulletinError) code = error.code;
    else {
      console.error("[bulletin] action failed", error);
      code = "failed";
    }
  }
  revalidatePath("/bulletin");
  // Board items are Kitchen Table posts, so the feed changes with them.
  revalidatePath(KITCHEN_TABLE_PATH);
  redirect(code ? `${base}${join}error=${code}` : notice ? `${base}${join}notice=${notice}` : base);
}

// Happenings ----------------------------------------------------------------

export async function hostHappeningAction(formData: FormData) {
  await run("happenings", async (userId) => {
    // Hosting also writes a Kitchen Table post, so createHappening holds its
    // own hourly cap on top of this board-wide one.
    const zone = safeTimeZone(String(formData.get("timezone") ?? "UTC"));
    await createHappening(userId, {
      kind: formData.get("kind"),
      title: formData.get("title"),
      description: formData.get("description"),
      city: formData.get("city"),
      region: formData.get("region"),
      country: formData.get("country"),
      address: formData.get("address"),
      startsAt: fromLocalInputValue(String(formData.get("startsAt") ?? ""), zone),
      capacity: formData.get("capacity"),
      approvalRequired: formData.get("approvalRequired") === "on",
    });
    return "hosted";
  });
}

export async function rsvpAction(formData: FormData) {
  const id = String(formData.get("happeningId") ?? "");
  await run("happenings", async (userId) => {
    const status = await requestRsvp(userId, id);
    return status === "approved" ? "going" : "requested";
  });
}

export async function withdrawRsvpAction(formData: FormData) {
  const id = String(formData.get("happeningId") ?? "");
  await run("happenings", async (userId) => {
    await withdrawRsvp(userId, id);
  });
}

export async function decideRsvpAction(formData: FormData) {
  const rsvpId = String(formData.get("rsvpId") ?? "");
  const approve = formData.get("decision") === "approve";
  await run("happenings", async (userId) => {
    await decideRsvp(userId, rsvpId, approve);
  });
}

export async function cancelHappeningAction(formData: FormData) {
  const id = String(formData.get("happeningId") ?? "");
  await run("happenings", async (userId) => {
    await cancelHappening(userId, id);
    return "canceled";
  });
}

// Member services -----------------------------------------------------------

export async function saveCardAction(formData: FormData) {
  await run("services", async (userId) => {
    await saveServiceCard(userId, {
      title: formData.get("title"),
      body: formData.get("body"),
      category: formData.get("category"),
      city: formData.get("city"),
    });
    return "card";
  });
}

export async function deleteCardAction() {
  await run("services", async (userId) => {
    await deleteServiceCard(userId);
    return "removed";
  });
}

// Places --------------------------------------------------------------------

export async function submitPlaceAction(formData: FormData) {
  await run(
    "places",
    async (userId) => {
      await submitPlace(userId, {
        name: formData.get("name"),
        category: formData.get("category"),
        veganStatus: formData.get("veganStatus"),
        city: formData.get("city"),
        region: formData.get("region"),
        country: formData.get("country"),
        address: formData.get("address"),
        website: formData.get("website"),
      });
      return "place";
    },
    { limit: 15 },
  );
}

export async function testimonialAction(formData: FormData) {
  const placeId = String(formData.get("placeId") ?? "");
  await run("places", async (userId) => {
    await saveTestimonial(userId, placeId, formData.get("body"));
    // "Local Guide" is earned by testimonials; check once the response is out.
    after(() => awardBadges(userId).catch(() => undefined));
    return "testimonial";
  });
}
