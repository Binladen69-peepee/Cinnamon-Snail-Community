"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import {
  TrackError,
  bumpVersion,
  createMilestone,
  createTrack,
  deleteMilestone,
  deleteTrack,
  moveMilestone,
  saveMilestone,
  setPublished,
  updateTrack,
  variantsFromForm,
  type MilestoneInput,
} from "@/lib/admin/roadmap";

/**
 * Roadmap authoring actions.
 *
 * Every one re-checks staff on the server. The admin layout already redirects a
 * non-admin away from the page, but a server action is a public endpoint — the
 * layout guards what somebody *sees*, not what they can POST.
 *
 * Failures come back as a message on the page rather than an exception, because
 * the things that go wrong here are ordinary editorial mistakes: an empty name,
 * publishing a track with no milestones, deleting one somebody is part-way
 * through. `TrackError` carries those; anything else is a real fault and is
 * logged as one.
 */

async function requireStaff() {
  const session = await auth();
  const staff = session?.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  // The member front door; `/home` only redirects there now (DEC-078).
  if (!session?.user.id || !staff) redirect(MEMBER_HOME_PATH);
  return session.user.id;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Run a write, turning an editorial refusal into a message. */
async function run(label: string, work: () => Promise<void>): Promise<ActionResult> {
  await requireStaff();
  try {
    await work();
    return { ok: true };
  } catch (cause) {
    if (cause instanceof TrackError) return { ok: false, error: cause.message };
    console.error(`[admin/roadmap] ${label} failed`, cause);
    return { ok: false, error: "That did not save. Try again in a moment." };
  }
}

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};
const optional = (form: FormData, key: string): string | null => {
  const value = text(form, key).trim();
  return value.length > 0 ? value : null;
};

function milestoneFromForm(form: FormData): MilestoneInput {
  const variants = variantsFromForm(form);
  return {
    topic: text(form, "topic"),
    learningGoal: text(form, "learningGoal"),
    communityAction: optional(form, "communityAction"),
    lessonId: optional(form, "lessonId"),
    recipeId: optional(form, "recipeId"),
    recipeIdGlutenFree: optional(form, "recipeIdGlutenFree"),
    ...variants,
  };
}

/** Creating redirects into the new track's editor, so it never returns ok. */
export async function createTrackAction(form: FormData): Promise<ActionResult> {
  await requireStaff();
  let slug: string;
  try {
    const track = await createTrack({
      name: text(form, "name"),
      description: optional(form, "description"),
    });
    slug = track.slug;
  } catch (cause) {
    if (cause instanceof TrackError) return { ok: false, error: cause.message };
    console.error("[admin/roadmap] create failed", cause);
    return { ok: false, error: "That did not save. Try again in a moment." };
  }
  revalidatePath("/admin/roadmap");
  redirect(`/admin/roadmap/${slug}`);
}

export async function updateTrackAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("update", async () => {
    await updateTrack(text(form, "trackId"), {
      name: text(form, "name"),
      description: optional(form, "description"),
      kitTag: optional(form, "kitTag"),
      kitCompletedTag: optional(form, "kitCompletedTag"),
    });
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/admin/roadmap");
  });
}

export async function setPublishedAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("publish", async () => {
    await setPublished(text(form, "trackId"), text(form, "published") === "1");
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/admin/roadmap");
    // A published track changes what every member sees on their roadmap.
    revalidatePath("/roadmap");
  });
}

export async function bumpVersionAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("version", async () => {
    await bumpVersion(text(form, "trackId"));
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/admin/roadmap");
  });
}

export async function deleteTrackAction(form: FormData): Promise<ActionResult> {
  const result = await run("delete track", async () => {
    await deleteTrack(text(form, "trackId"));
    revalidatePath("/admin/roadmap");
  });
  if (result.ok) redirect("/admin/roadmap");
  return result;
}

export async function createMilestoneAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("create milestone", async () => {
    await createMilestone(text(form, "trackId"), milestoneFromForm(form));
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/roadmap");
  });
}

export async function saveMilestoneAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("save milestone", async () => {
    await saveMilestone(text(form, "milestoneId"), milestoneFromForm(form));
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/roadmap");
  });
}

export async function deleteMilestoneAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("delete milestone", async () => {
    await deleteMilestone(text(form, "milestoneId"));
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/roadmap");
  });
}

export async function moveMilestoneAction(form: FormData): Promise<ActionResult> {
  const slug = text(form, "slug");
  return run("reorder", async () => {
    const direction = text(form, "direction") === "up" ? "up" : "down";
    await moveMilestone(text(form, "milestoneId"), direction);
    revalidatePath(`/admin/roadmap/${slug}`);
    revalidatePath("/roadmap");
  });
}
