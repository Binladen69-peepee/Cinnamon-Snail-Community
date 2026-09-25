import "server-only";
import { prisma } from "@/lib/db";

/**
 * An event's address.
 *
 * Titles repeat — a weekly class is called the same thing every week, and a
 * term has four "Week one"s across four courses. So the date goes in the slug
 * for anything that recurs, and a counter catches the rest.
 *
 * Dates are formatted in UTC deliberately. The slug is an identifier, not a
 * time display: rendering it in the event's zone would make the same event
 * reachable at two addresses depending on who generated it.
 */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "event"
  );
}

export async function uniqueEventSlug(
  title: string,
  startsAt?: Date | null,
): Promise<string> {
  const base = slugifyTitle(title);
  const dated = startsAt
    ? `${base}-${startsAt.toISOString().slice(0, 10)}`
    : base;

  for (const candidate of [dated, base]) {
    const taken = await prisma.event.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  for (let suffix = 2; suffix < 200; suffix += 1) {
    const candidate = `${dated}-${suffix}`;
    const taken = await prisma.event.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}
