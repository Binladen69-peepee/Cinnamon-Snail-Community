"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import {
  CategoryError,
  addClassesToShelf,
  createCategory,
  deleteCategory,
  moveCategory,
  moveClassOnShelf,
  removeClassFromShelf,
  setCourseCategories,
  updateCategory,
} from "@/lib/learn/categories";

/**
 * Class categories: the shelves of the library (DEC-078).
 *
 * Every write here is staff-only and re-checks the session's roles. The admin
 * layout redirects a non-admin, but a server action is a public endpoint: the
 * layout guards the page, not the POST. Validation lives in
 * `lib/learn/categories`, so the rules hold for every caller and are tested
 * there; this file maps them to messages and says what changed.
 */

export type CategoryActionResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string };

async function requireStaff() {
  const session = await auth();
  if (!session?.user.id) return null;
  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  return isStaff ? session : null;
}

const DENIED: CategoryActionResult = { ok: false, error: "Admins only." };

function failure(error: unknown): CategoryActionResult {
  if (error instanceof CategoryError) return { ok: false, error: error.message };
  Sentry.captureException(error, { tags: { area: "class-categories" } });
  return { ok: false, error: "That did not save. Try again." };
}

/**
 * Everything a shelf change can reach: the library, every class page (their
 * category links), the console's list, the category screens and the editor.
 */
function revalidateShelves() {
  revalidatePath("/learn");
  revalidatePath("/(member)/learn/[slug]", "page");
  revalidatePath("/admin/courses");
  revalidatePath("/admin/courses/categories");
  revalidatePath("/admin/courses/categories/[slug]", "page");
  revalidatePath("/admin/courses/[slug]/edit", "page");
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export async function createCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  try {
    const category = await createCategory({
      name: text(formData, "name"),
      description: text(formData, "description"),
    });
    await writeAuditLog({
      actorId: session.user.id,
      action: "course_category.create",
      targetType: "CourseCategory",
      targetId: category.id,
      metadata: { slug: category.slug, name: category.name },
    }).catch(() => undefined);
    revalidateShelves();
    return { ok: true, slug: category.slug };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  try {
    const category = await updateCategory({
      id: text(formData, "categoryId"),
      name: text(formData, "name"),
      description: text(formData, "description"),
    });
    await writeAuditLog({
      actorId: session.user.id,
      action: "course_category.update",
      targetType: "CourseCategory",
      targetId: category.id,
      metadata: {
        slug: category.slug,
        name: category.name,
        previousName: category.previousName,
      },
    }).catch(() => undefined);
    revalidateShelves();
    return { ok: true, slug: category.slug };
  } catch (error) {
    return failure(error);
  }
}

export async function moveCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  try {
    await moveCategory({
      id: text(formData, "categoryId"),
      direction: text(formData, "direction"),
    });
    revalidateShelves();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Delete a category. Only the shelf and its links go; every class on it stays
 * in the library, on its other shelves. The audit row keeps what was removed.
 */
export async function deleteCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  try {
    const removed = await deleteCategory({ id: text(formData, "categoryId") });
    await writeAuditLog({
      actorId: session.user.id,
      action: "course_category.delete",
      targetType: "CourseCategory",
      targetId: removed.id,
      metadata: {
        slug: removed.slug,
        name: removed.name,
        removedLinks: removed.removedLinks,
      },
    }).catch(() => undefined);
    revalidateShelves();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Classes on shelves                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The course editor's checkboxes: put one class on exactly these shelves.
 * Shelves it stays on keep its place; new ones take it at the end.
 */
export async function setCourseCategoriesAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  const slug = text(formData, "slug").trim();
  const course = slug
    ? await prisma.course.findUnique({ where: { slug }, select: { id: true } })
    : null;
  if (!course) return { ok: false, error: "That course no longer exists." };

  try {
    const change = await setCourseCategories({
      courseId: course.id,
      categoryIds: formData
        .getAll("categoryId")
        .filter((value): value is string => typeof value === "string"),
    });
    if (change.added.length > 0 || change.removed.length > 0) {
      await writeAuditLog({
        actorId: session.user.id,
        action: "course.categories_set",
        targetType: "Course",
        targetId: course.id,
        metadata: { slug, added: change.added, removed: change.removed },
      }).catch(() => undefined);
    }
    revalidateShelves();
    revalidatePath(`/learn/${slug}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addClassesToShelfAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  const categoryId = text(formData, "categoryId");
  try {
    const result = await addClassesToShelf({
      categoryId,
      courseIds: formData
        .getAll("courseId")
        .filter((value): value is string => typeof value === "string"),
    });
    if (result.added > 0) {
      await writeAuditLog({
        actorId: session.user.id,
        action: "course_category.classes_added",
        targetType: "CourseCategory",
        targetId: categoryId,
        metadata: { added: result.added },
      }).catch(() => undefined);
    }
    revalidateShelves();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removeClassFromShelfAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  const categoryId = text(formData, "categoryId");
  const courseId = text(formData, "courseId");
  try {
    const removed = await removeClassFromShelf({ categoryId, courseId });
    if (removed) {
      await writeAuditLog({
        actorId: session.user.id,
        action: "course_category.class_removed",
        targetType: "CourseCategory",
        targetId: categoryId,
        metadata: { courseId },
      }).catch(() => undefined);
    }
    revalidateShelves();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function moveClassOnShelfAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await requireStaff();
  if (!session) return DENIED;

  try {
    await moveClassOnShelf({
      categoryId: text(formData, "categoryId"),
      courseId: text(formData, "courseId"),
      direction: text(formData, "direction"),
    });
    revalidateShelves();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
