"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { uniqueCourseSlug } from "@/lib/admin/courses";
import { writeAuditLog } from "@/lib/audit";
import { objectPathFromUrl, verifyUploaded } from "@/lib/uploads/storage";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Every write here is staff-only and re-checks the session's roles. The layout
 * already redirects a non-admin, but a server action is a public endpoint: the
 * layout guards the page, not the POST.
 */
async function requireStaff() {
  const session = await auth();
  if (!session?.user.id) return null;
  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  return isStaff ? session : null;
}

export async function createCourseAction(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the product a name." };
  if (name.length > 160) {
    return { ok: false, error: "That name is too long." };
  }

  const slug = await uniqueCourseSlug(name);
  const course = await prisma.course.create({
    // Created unpublished on purpose: a new course with no lessons should not
    // appear in the member library the moment it is named.
    data: { slug, title: name, published: false },
    select: { id: true, slug: true },
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: "course.create",
    targetType: "Course",
    targetId: course.id,
    metadata: { slug: course.slug, title: name },
  });

  revalidatePath("/admin/courses");
  redirect(`/admin/courses/${course.slug}/edit`);
}

export async function setCoursePublishedAction(
  formData: FormData,
): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const slug = String(formData.get("slug") ?? "").trim();
  const published = String(formData.get("published") ?? "") === "1";
  if (!slug) return { ok: false, error: "Missing course." };

  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true, _count: { select: { sections: true } } },
  });
  if (!course) return { ok: false, error: "That course no longer exists." };

  await prisma.course.update({ where: { slug }, data: { published } });
  await writeAuditLog({
    actorId: session.user.id,
    action: published ? "course.publish" : "course.unpublish",
    targetType: "Course",
    targetId: course.id,
    metadata: { slug },
  });

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${slug}/edit`);
  // Publishing changes what members see, so their library has to forget too.
  revalidatePath("/learn");
  revalidatePath(`/learn/${slug}`);
  return { ok: true };
}

/**
 * The thumbnail must be a file this admin just uploaded to our own bucket —
 * the same check the feed runs on post attachments. Without it the column is an
 * open redirect into any host.
 */
export async function setCourseThumbnailAction(
  formData: FormData,
): Promise<Result> {
  const session = await requireStaff();
  if (!session) return { ok: false, error: "Admins only." };

  const slug = String(formData.get("slug") ?? "").trim();
  const raw = String(formData.get("coverUrl") ?? "").trim() || null;
  if (!slug) return { ok: false, error: "Missing course." };

  let coverUrl: string | null = null;
  if (raw) {
    const path = objectPathFromUrl(raw);
    if (!path) return { ok: false, error: "That image is not one of ours." };
    const verified = await verifyUploaded({ userId: session.user.id, path });
    if (!verified.ok) return { ok: false, error: verified.error };
    if (!verified.mimeType?.startsWith("image/")) {
      return { ok: false, error: "A thumbnail has to be an image." };
    }
    coverUrl = raw;
  }

  const course = await prisma.course.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "That course no longer exists." };

  await prisma.course.update({ where: { slug }, data: { coverUrl } });
  await writeAuditLog({
    actorId: session.user.id,
    action: coverUrl ? "course.thumbnail.set" : "course.thumbnail.reset",
    targetType: "Course",
    targetId: course.id,
    metadata: { slug },
  });

  revalidatePath(`/admin/courses/${slug}/edit`);
  revalidatePath("/admin/courses");
  revalidatePath(`/learn/${slug}`);
  return { ok: true };
}
