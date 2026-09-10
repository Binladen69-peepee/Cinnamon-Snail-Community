"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { memberCanPlayLessons } from "@/lib/learn/access";
import { saveLessonProgress } from "@/lib/learn/progress";
import { awardBadges } from "@/lib/social/badges";
import { ensureCourseCohort } from "@/lib/social/cohorts";

async function requirePlayer() {
  const session = await auth();
  if (!session?.user.id) throw new Error("You need to sign in.");
  const allowed = await memberCanPlayLessons(session.user.id);
  if (!allowed) throw new Error("An active membership is required to play lessons.");
  return session.user.id;
}

export async function saveProgressAction(formData: FormData) {
  const userId = await requirePlayer();
  const result = await saveLessonProgress({
    userId,
    lessonId: String(formData.get("lessonId")),
    positionSeconds: Number(formData.get("positionSeconds") ?? 0),
    completed: String(formData.get("completed")) === "true",
  });
  if (result.startedCourse) {
    after(() => ensureCourseCohort(userId, result.courseId));
  }
  revalidatePath("/learn");
}

export async function completeLessonAction(formData: FormData) {
  const userId = await requirePlayer();
  const result = await saveLessonProgress({
    userId,
    lessonId: String(formData.get("lessonId")),
    positionSeconds: Number(formData.get("positionSeconds") ?? 0),
    completed: true,
  });
  if (result.startedCourse) {
    after(() => ensureCourseCohort(userId, result.courseId));
  }
  const courseSlug = String(formData.get("courseSlug") ?? "");
  const nextHref = String(formData.get("nextHref") ?? `/learn/${courseSlug}`);
  revalidatePath("/learn");
  if (courseSlug) revalidatePath(`/learn/${courseSlug}`);
  after(() => awardBadges(userId));
  redirect(nextHref || `/learn/${courseSlug}`);
}
