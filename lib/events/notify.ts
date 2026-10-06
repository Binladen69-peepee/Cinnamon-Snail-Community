import "server-only";
import { prisma } from "@/lib/db";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { formatEventTime, safeTimeZone, zoneLabel } from "@/lib/events/timezone";
import { liveClassHref } from "@/lib/events/paths";

/**
 * Telling the people coming to a live class that something changed.
 *
 * One path for every writer: the admin form and the Zoom sync both cancel and
 * move classes, and a member should hear the same thing, worded the same way,
 * whichever of them did it.
 *
 * Times are written in each member's own zone (their profile's, or the class's
 * when they never set one), with the zone named, because a notification is
 * read without the page around it and "19:00" alone is how somebody turns up
 * an hour late.
 */

type ClassRef = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  timezone: string;
};

/** "Thu 25 Sep, 19:00 GMT-4": a time that says which clock it is on. */
export function describeClassTime(startsAt: Date, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  return `${formatEventTime(startsAt, zone)} ${zoneLabel(startsAt, zone)}`;
}

/** Each member's own zone, for the members given, in one query. */
export async function memberTimeZones(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.profile.findMany({
    where: { userId: { in: userIds }, timezone: { not: null } },
    select: { userId: true, timezone: true },
  });
  return new Map(
    rows
      .filter((row): row is { userId: string; timezone: string } => Boolean(row.timezone))
      .map((row) => [row.userId, safeTimeZone(row.timezone)] as const),
  );
}

async function attendeesOf(eventId: string): Promise<string[]> {
  const rows = await prisma.eventRsvp.findMany({
    where: { eventId, status: { in: ["GOING", "WAITLIST"] } },
    select: { userId: true },
    take: 1000,
  });
  return rows.map((row) => row.userId);
}

/**
 * One notification per member who said they were coming or are waiting.
 * `body` may be a function of the member, for anything that states a time.
 */
export async function notifyEventAttendees(
  eventId: string,
  message: {
    title: string;
    body: string | ((userId: string) => string);
    href: string;
    /** Makes the notice once-per-member, for a writer that may run twice. */
    dedupeKey?: string;
  },
): Promise<number> {
  const userIds = await attendeesOf(eventId);
  if (userIds.length === 0) return 0;
  const result = await dispatchNotifications(
    userIds.map((userId) => ({
      userId,
      category: "EVENTS" as const,
      title: message.title,
      body: typeof message.body === "function" ? message.body(userId) : message.body,
      href: message.href,
      dedupeKey: message.dedupeKey,
    })),
  );
  return result.created;
}

/**
 * The class is off. Said once per member per class when `once` is set, which
 * is what the Zoom sync wants: two overlapping runs must not say it twice.
 */
export async function announceEventCanceled(
  event: Pick<ClassRef, "id" | "slug" | "title">,
  options: { once?: boolean } = {},
): Promise<number> {
  return notifyEventAttendees(event.id, {
    title: `Canceled: ${event.title}`,
    body: "This live class is off. Nothing will happen at the time it was scheduled.",
    href: liveClassHref(event.slug),
    dedupeKey: options.once ? `event-canceled:${event.id}` : undefined,
  });
}

/**
 * The class moved. Keyed by the new time, so each move is told once however
 * many times it is noticed, and a second move is told again.
 */
export async function announceEventMoved(event: ClassRef): Promise<number> {
  const userIds = await attendeesOf(event.id);
  if (userIds.length === 0) return 0;
  const zones = await memberTimeZones(userIds);
  const result = await dispatchNotifications(
    userIds.map((userId) => ({
      userId,
      category: "EVENTS" as const,
      title: `Moved: ${event.title}`,
      body: `Now ${describeClassTime(event.startsAt, zones.get(userId) ?? event.timezone)}. Open the class for the details, and update your own calendar.`,
      href: liveClassHref(event.slug),
      dedupeKey: `event-moved:${event.id}:${event.startsAt.toISOString()}`,
    })),
  );
  return result.created;
}

/**
 * Forget which reminders went out, after a class moves.
 *
 * The rows exist so a reminder is sent once per class; once the class is at a
 * different time, "once" has to start again or the people coming hear nothing
 * about the new time. The reminders' own notification keys carry the start
 * time, so the new ones are not mistaken for repeats.
 */
export async function resetEventReminders(eventId: string): Promise<void> {
  await prisma.eventReminder.deleteMany({ where: { eventId } });
}
