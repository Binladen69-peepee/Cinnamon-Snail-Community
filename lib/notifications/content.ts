import type { NotificationCategory } from "@prisma/client";

/**
 * What a notification may say once it leaves the inbox.
 *
 * The inbox is the member's own, behind their session, so it can quote what
 * was said. An email sits in a mailbox other software reads, and a push
 * notification sits on a lock screen anyone nearby can see. A direct message
 * is the one category whose body is somebody's private words, so outside the
 * inbox it is reduced to who sent it and where to read it.
 */
const PRIVATE_BODY: Partial<Record<NotificationCategory, string>> = {
  DMS: "Open Vegan University to read it.",
};

export function isPrivateCategory(category: NotificationCategory): boolean {
  return category in PRIVATE_BODY;
}

/** The body as it may appear in an email or a push notification. */
export function outsideBody(category: NotificationCategory, body: string): string {
  return PRIVATE_BODY[category] ?? body;
}

/** The public origin links are built against. */
export function appOrigin(): string {
  const configured =
    process.env.AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ??
    "http://localhost:3000";
  return configured.replace(/\/$/, "");
}

/**
 * An absolute URL for a notification's link. Only same-site paths are ever
 * linked: a stored href is always a path, and anything that is not one is
 * treated as missing rather than followed.
 */
export function absoluteHref(href: string | null | undefined): string {
  const path = href && href.startsWith("/") && !href.startsWith("//") ? href : "/notifications";
  return `${appOrigin()}${path}`;
}

/** Same rule, relative, for the service worker to open. */
export function safePath(href: string | null | undefined): string {
  return href && href.startsWith("/") && !href.startsWith("//") ? href : "/notifications";
}
