import "server-only";
import { prisma } from "@/lib/db";
import { LIVE_CLASSES_PATH, liveClassHref } from "@/lib/events/paths";
import { linksIn } from "@/lib/messages/format";

/**
 * Previews for links shared in a thread — our own, and only our own.
 *
 * "Where safe" is the whole design here. A general link preview fetches a URL
 * a member chose, from our server, which is a server-side request forgery
 * primitive: paste a link to `169.254.169.254` or to something on the private
 * network and the preview is the response. Doing it properly means an
 * allowlist, DNS resolution checks against private ranges, a redirect cap, a
 * timeout, a body-size limit and HTML parsing of untrusted markup — a lot of
 * attack surface for a thumbnail of somebody's blog.
 *
 * Internal links need none of it. They resolve out of our own database, they
 * are the links members actually share in a cooking school — "watch this
 * lesson", "come to this class", "look at this post" — and a preview of one
 * is more useful than a preview of a news article would be, because it is
 * something the reader can act on in the same app.
 *
 * External links are still linked, just not unfurled. That is stated in the
 * UI rather than left to look like a bug.
 *
 * A preview is shown to everyone in the thread, not just to whoever pasted
 * the link, so it only ever describes something any member could open: a
 * post or a live class in a private or product-locked room gets no card (the
 * link itself still works for whoever may follow it). Live classes live at
 * `/live-classes/<slug>` (DEC-079); links written before the rename, to
 * `/calendar/<slug>`, are still recognised and point at the new address.
 */

/**
 * Rooms whose contents any member may read: the same open doors the space
 * preview below already required, and not sold separately.
 */
const OPEN_ROOM = {
  visibility: { in: ["PUBLIC" as const, "MEMBERS" as const] },
  productId: null,
};

/** The first path segment of a live class's page, now and before the rename. */
const LIVE_CLASS_SEGMENTS = new Set([LIVE_CLASSES_PATH.slice(1), "calendar"]);

export type LinkPreview = {
  url: string;
  kind: "lesson" | "class" | "event" | "post" | "member" | "space";
  title: string;
  detail: string | null;
  href: string;
  imageUrl: string | null;
};

/** Paths we can describe, and how to read their parameters. */
type Parsed =
  | { kind: "class"; slug: string }
  | { kind: "lesson"; courseSlug: string; lessonSlug: string }
  | { kind: "event"; slug: string }
  | { kind: "post"; id: string }
  | { kind: "member"; handle: string }
  | { kind: "space"; slug: string };

/**
 * Recognise one of our own URLs.
 *
 * Absolute links are only accepted when their host matches the request's own,
 * so `https://evil.example/learn/x` is never mistaken for ours. Relative ones
 * are ours by definition.
 */
export function parseInternalLink(raw: string, origin: string): Parsed | null {
  let path: string;
  try {
    if (raw.startsWith("/")) {
      path = raw;
    } else {
      const url = new URL(raw);
      const here = new URL(origin);
      if (url.host !== here.host) return null;
      path = url.pathname;
    }
  } catch {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  if (parts[0] === "learn" && parts.length === 2) {
    return { kind: "class", slug: parts[1]! };
  }
  if (parts[0] === "learn" && parts.length === 3) {
    return { kind: "lesson", courseSlug: parts[1]!, lessonSlug: parts[2]! };
  }
  if (LIVE_CLASS_SEGMENTS.has(parts[0]!) && parts.length === 2) {
    return { kind: "event", slug: parts[1]! };
  }
  if (parts[0] === "posts" && parts.length === 2) {
    return { kind: "post", id: parts[1]! };
  }
  if (parts[0] === "members" && parts.length === 2) {
    return { kind: "member", handle: parts[1]! };
  }
  if (parts[0] === "spaces" && parts.length === 2) {
    return { kind: "space", slug: parts[1]! };
  }
  return null;
}


/**
 * Describe every internal link across a page of messages, in one pass.
 *
 * Batched by kind rather than resolved per link, so a thread where somebody
 * pasted six lessons costs one query for lessons rather than six. The result
 * is keyed by URL so the bubble can look its own link up.
 *
 * Nothing here reveals anything the reader could not already see: a preview is
 * only returned for a published, reachable thing, and a member's own profile
 * is public to members by design.
 */
export async function previewInternalLinks(input: {
  bodies: string[];
  origin: string;
}): Promise<Map<string, LinkPreview>> {
  const found = new Map<string, Parsed>();
  for (const body of input.bodies) {
    for (const url of linksIn(body)) {
      if (found.has(url)) continue;
      const parsed = parseInternalLink(url, input.origin);
      if (parsed) found.set(url, parsed);
      // A cap: a message full of links should not become a query storm.
      if (found.size >= 12) break;
    }
  }
  if (found.size === 0) return new Map();

  const entries = [...found.entries()];
  const pick = <T extends Parsed["kind"]>(kind: T) =>
    entries.filter(([, parsed]) => parsed.kind === kind);

  const classSlugs = pick("class").map(([, p]) => (p as { slug: string }).slug);
  const lessonKeys = pick("lesson").map(
    ([, p]) => p as { courseSlug: string; lessonSlug: string },
  );
  const eventSlugs = pick("event").map(([, p]) => (p as { slug: string }).slug);
  const postIds = pick("post").map(([, p]) => (p as { id: string }).id);
  const handles = pick("member").map(([, p]) => (p as { handle: string }).handle);
  const spaceSlugs = pick("space").map(([, p]) => (p as { slug: string }).slug);

  const [courses, lessons, events, posts, members, spaces] = await Promise.all([
    classSlugs.length
      ? prisma.course.findMany({
          where: { slug: { in: classSlugs }, published: true },
          select: { slug: true, title: true, category: true, coverUrl: true },
        })
      : [],
    lessonKeys.length
      ? prisma.lesson.findMany({
          where: {
            published: true,
            slug: { in: lessonKeys.map((key) => key.lessonSlug) },
            section: { course: { published: true } },
          },
          select: {
            slug: true,
            title: true,
            durationMin: true,
            section: { select: { course: { select: { slug: true, title: true } } } },
          },
        })
      : [],
    eventSlugs.length
      ? prisma.event.findMany({
          where: {
            slug: { in: eventSlugs },
            status: "PUBLISHED",
            // Every class from Zoom has no room; one in a room inherits its door.
            OR: [{ spaceId: null }, { space: OPEN_ROOM }],
          },
          select: { slug: true, title: true, startsAt: true, coverUrl: true },
        })
      : [],
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds }, status: "PUBLISHED", space: OPEN_ROOM },
          select: {
            id: true,
            title: true,
            plainText: true,
            space: { select: { name: true } },
          },
        })
      : [],
    handles.length
      ? prisma.user.findMany({
          where: { handle: { in: handles }, status: "ACTIVE" },
          select: {
            handle: true,
            profile: { select: { displayName: true, avatarUrl: true, city: true } },
          },
        })
      : [],
    spaceSlugs.length
      ? prisma.space.findMany({
          where: { slug: { in: spaceSlugs }, visibility: { in: ["PUBLIC", "MEMBERS"] } },
          select: { slug: true, name: true, description: true },
        })
      : [],
  ]);

  const out = new Map<string, LinkPreview>();

  for (const [url, parsed] of entries) {
    if (parsed.kind === "class") {
      const row = courses.find((course) => course.slug === parsed.slug);
      if (row) {
        out.set(url, {
          url,
          kind: "class",
          title: row.title,
          detail: row.category,
          href: `/learn/${row.slug}`,
          imageUrl: row.coverUrl,
        });
      }
    }
    if (parsed.kind === "lesson") {
      const row = lessons.find(
        (lesson) =>
          lesson.slug === parsed.lessonSlug &&
          lesson.section.course.slug === parsed.courseSlug,
      );
      if (row) {
        out.set(url, {
          url,
          kind: "lesson",
          title: row.title,
          detail: row.durationMin
            ? `${row.section.course.title} · ${row.durationMin} min`
            : row.section.course.title,
          href: `/learn/${parsed.courseSlug}/${row.slug}`,
          imageUrl: null,
        });
      }
    }
    if (parsed.kind === "event") {
      const row = events.find((event) => event.slug === parsed.slug);
      if (row) {
        out.set(url, {
          url,
          kind: "event",
          title: row.title,
          detail: new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }).format(row.startsAt),
          href: liveClassHref(row.slug),
          imageUrl: row.coverUrl,
        });
      }
    }
    if (parsed.kind === "post") {
      const row = posts.find((post) => post.id === parsed.id);
      if (row) {
        out.set(url, {
          url,
          kind: "post",
          title: row.title || row.plainText.slice(0, 80) || "A post",
          detail: row.space?.name ?? null,
          href: `/posts/${row.id}`,
          imageUrl: null,
        });
      }
    }
    if (parsed.kind === "member") {
      const row = members.find((user) => user.handle === parsed.handle);
      if (row) {
        out.set(url, {
          url,
          kind: "member",
          title: row.profile?.displayName ?? row.handle,
          detail: row.profile?.city ?? `@${row.handle}`,
          href: `/members/${row.handle}`,
          imageUrl: row.profile?.avatarUrl ?? null,
        });
      }
    }
    if (parsed.kind === "space") {
      const row = spaces.find((space) => space.slug === parsed.slug);
      if (row) {
        out.set(url, {
          url,
          kind: "space",
          title: row.name,
          detail: row.description?.slice(0, 80) ?? null,
          href: `/spaces/${row.slug}`,
          imageUrl: null,
        });
      }
    }
  }

  return out;
}
