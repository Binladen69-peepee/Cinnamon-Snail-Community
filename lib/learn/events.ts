import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications/create";

export async function listUpcomingEvents() {
  return prisma.event.findMany({
    where: { startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { startsAt: "asc" },
    include: {
      _count: { select: { rsvps: true } },
      rsvps: { select: { userId: true, status: true } },
    },
  });
}

export async function rsvpToEvent(input: { userId: string; eventId: string; status: "going" | "waitlist" | "not_going" }) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: input.eventId },
    include: { _count: { select: { rsvps: { where: { status: "going" } } } } },
  });
  let status = input.status;
  if (status === "going" && event.capacity && event._count.rsvps >= event.capacity) {
    status = "waitlist";
  }
  const row = await prisma.eventRsvp.upsert({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
    update: { status },
    create: { eventId: input.eventId, userId: input.userId, status },
  });
  if (status === "going") {
    await createNotification({
      userId: input.userId,
      category: "EVENTS",
      title: `You're going: ${event.title}`,
      body: "We'll keep this on your campus calendar. Add it to your own calendar from the event card.",
      href: "/calendar",
    });
  }
  return row;
}

export function eventIcs(event: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  location: string | null;
}) {
  const stamp = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vegan University//Campus//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@veganuniversity`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : "",
    event.location ? `LOCATION:${escapeIcs(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function notifyUpcomingEventReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: now, lte: soon } },
    include: { rsvps: { where: { status: "going" } } },
  });
  let sent = 0;
  for (const event of events) {
    for (const rsvp of event.rsvps) {
      const already = await prisma.notification.findFirst({
        where: {
          userId: rsvp.userId,
          category: "EVENTS",
          href: `/calendar#${event.id}`,
        },
      });
      if (already) continue;
      await createNotification({
        userId: rsvp.userId,
        category: "EVENTS",
        title: `Tomorrow: ${event.title}`,
        body: "Your RSVP is on the campus calendar.",
        href: `/calendar#${event.id}`,
      });
      sent += 1;
    }
  }
  return { sent };
}
