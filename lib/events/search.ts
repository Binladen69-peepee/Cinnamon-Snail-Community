import "server-only";
import { prisma } from "@/lib/db";
import { upsertSearchIndex } from "@/lib/search";
import { richTextToPlain } from "@/lib/content/rich-text";

/**
 * Keeping a live class findable.
 *
 * One rule for every path that writes a class (the admin form, the Zoom sync):
 * a published class is in the search index under its slug, and anything else
 * is not. A canceled class disappearing from search is the point; a draft
 * appearing in it would be a leak.
 */

export async function indexEvent(id: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id },
    select: { slug: true, title: true, description: true, status: true, spaceId: true },
  });
  if (!event) return;

  if (event.status !== "PUBLISHED") {
    await unindexEvent(event.slug);
    return;
  }

  await upsertSearchIndex({
    entityType: "event",
    entityId: event.slug,
    title: event.title,
    body: richTextToPlain(event.description ?? "").slice(0, 2000),
    spaceId: event.spaceId,
  });
}

export async function unindexEvent(slug: string): Promise<void> {
  await prisma.searchIndex
    .delete({ where: { entityType_entityId: { entityType: "event", entityId: slug } } })
    .catch(() => undefined);
}
