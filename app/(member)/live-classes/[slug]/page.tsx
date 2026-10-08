import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  CalendarClock,
  MapPin,
  MessagesSquare,
  Repeat,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { servableImageUrl } from "@/lib/media/servable-image";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  Callout,
  Card,
  PageHeader,
  Section,
} from "@/components/app/ui";
import { RichText } from "@/components/content/rich-text";
import { Avatar } from "@/components/ui/avatar";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { ClassHost } from "@/components/events/class-host";
import { EventBadges } from "@/components/events/event-badges";
import { EventTime } from "@/components/events/event-time";
import { JoinControl } from "@/components/events/join-control";
import { JoinWindowRefresh } from "@/components/events/join-window-refresh";
import { RecordingLink } from "@/components/events/recording-link";
import { RsvpButton } from "@/components/events/rsvp-button";
import { getEventViewer } from "@/lib/events/access";
import { googleCalendarUrl } from "@/lib/events/calendar-links";
import { nextJoinChange } from "@/lib/events/join";
import { LIVE_CLASSES_PATH, liveClassHref } from "@/lib/events/paths";
import { loadEvent } from "@/lib/events/queries";
import { describeRecurrence } from "@/lib/events/recurrence";
import { safeTimeZone } from "@/lib/events/timezone";
import { richTextToPlain } from "@/lib/content/rich-text";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) return { title: "Live class" };
  const { slug } = await params;
  const event = await loadEvent(session.user.id, slug);
  if (!event) notFound();
  return { title: event.title };
}

/** A row inside a card: a date in the run. */
const ROW =
  "flex items-center gap-3 px-4 py-3 text-body text-foreground no-underline transition hover:bg-surface-muted sm:px-5";

/** The site's own address, for the links a calendar entry carries back here. */
async function siteOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  if (host && /^[a-z0-9.:-]+$/i.test(host)) {
    const proto = list.get("x-forwarded-proto") === "http" ? "http" : "https";
    return `${proto}://${host}`;
  }
  return process.env.AUTH_URL?.replace(/\/$/, "") ?? "";
}

/**
 * One live class (DEC-079): everything about it on one page.
 *
 * Top to bottom: what and when (in the member's own zone) and who is hosting;
 * then the one card that holds the member's part, which is the RSVP, "Join on
 * Zoom" once the doors open (or when the link will appear, or what it takes to
 * get it), and adding the class to their own calendar; then what the class is
 * about, who is coming, the other dates in the run, and where the
 * conversation about it is. Once it has run, the card offers the recording.
 *
 * The Zoom link is only ever in this page when the member may use it right
 * now; see `lib/events/join.ts`.
 */
export default async function LiveClassPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const [event, viewer] = await Promise.all([
    loadEvent(session.user.id, slug),
    getEventViewer(session.user.id),
  ]);
  if (!event || !viewer) notFound();

  const timeZone = safeTimeZone(viewer.timeZone);
  const published = event.status === "PUBLISHED";
  const joinOpen = event.join.kind === "open";
  const refreshAt = nextJoinChange([event.join], new Date());

  const recurrence = describeRecurrence(
    event.recurrence
      ? {
          kind: event.recurrence,
          every: event.recurrenceEvery ?? 1,
          until: event.recurrenceUntil,
        }
      : null,
  );
  const hasBadges = event.live || !published;

  const googleHref =
    !event.past && published
      ? googleCalendarUrl(
          {
            id: event.id,
            slug: event.slug,
            title: event.title,
            description: event.description ? richTextToPlain(event.description) : null,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timezone: event.timezone,
            location: event.location,
            zoomUrl: event.calendarZoomUrl,
            status: event.status,
          },
          { baseUrl: await siteOrigin() },
        )
      : null;

  return (
    <AppShell>
      <JoinWindowRefresh at={refreshAt ? refreshAt.toISOString() : null} />
      <div className="flex flex-col gap-8">
        <PageHeader
          back={{ href: LIVE_CLASSES_PATH, label: "Live Classes" }}
          eyebrow="Live class"
          title={event.title}
          description={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <CalendarClock className="size-4 shrink-0" aria-hidden />
                <EventTime
                  startsAt={event.startsAt}
                  endsAt={event.endsAt}
                  eventTimeZone={event.timezone}
                  viewerTimeZone={timeZone}
                  className="tabular-nums text-foreground"
                />
              </span>
              {event.location ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  {event.location}
                </span>
              ) : null}
              {recurrence ? (
                <span className="inline-flex items-center gap-1.5">
                  <Repeat className="size-4 shrink-0" aria-hidden />
                  {recurrence}
                </span>
              ) : null}
            </span>
          }
        >
          {hasBadges || event.host ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {hasBadges ? (
                <EventBadges
                  live={event.live}
                  status={event.status}
                  draftLabel="Draft: only staff can see this"
                />
              ) : null}
              {event.host ? <ClassHost host={event.host} /> : null}
            </div>
          ) : null}
        </PageHeader>

        <div className="flex flex-col gap-4">
          {event.coverUrl ? (
            // The cover comes from the client's own media host, not the optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={servableImageUrl(event.coverUrl, 1600)}
              alt=""
              className="aspect-16/7 w-full rounded-card bg-surface-muted object-cover"
            />
          ) : null}

          {event.status === "CANCELED" ? (
            <Callout tone="danger" role="status" title="This live class was canceled.">
              Nothing will happen at the time above.{" "}
              <Link
                href={LIVE_CLASSES_PATH}
                className="font-semibold text-link no-underline hover:underline"
              >
                See what&apos;s coming up
              </Link>
            </Callout>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:p-5">
                {event.past ? (
                  <>
                    {event.recording ? (
                      <div>
                        <RecordingLink recording={event.recording} variant="primary" size="md" />
                      </div>
                    ) : event.recordingLocked ? (
                      <p className="text-body text-foreground-muted">
                        The recording is part of the membership.{" "}
                        <Link href="/billing" className="font-semibold text-link underline">
                          Check your membership
                        </Link>
                      </p>
                    ) : (
                      <p className="text-body text-foreground-muted">
                        There is no recording of this class yet.
                      </p>
                    )}
                    <p className="inline-flex items-center gap-2 text-label text-foreground-muted">
                      <Users className="size-4" aria-hidden />
                      {event.goingCount}{" "}
                      {event.goingCount === 1 ? "person went" : "people went"}.
                    </p>
                  </>
                ) : (
                  <>
                    {joinOpen ? <JoinControl join={event.join} size="lg" /> : null}
                    {event.join.kind === "members-only" &&
                    event.myStatus !== "GOING" &&
                    event.myStatus !== "WAITLIST" ? null : (
                      <RsvpButton
                        eventId={event.id}
                        status={event.myStatus}
                        waitlistPosition={event.myWaitlistPosition}
                        goingCount={event.goingCount}
                        capacity={event.capacity}
                        disabled={!published}
                        disabledReason="This class is not open for RSVPs yet."
                        quiet={joinOpen}
                      />
                    )}
                    {joinOpen ? null : <JoinControl join={event.join} size="lg" />}
                  </>
                )}
              </div>

              {googleHref ? (
                <div className="border-t border-separator bg-surface-muted/50 px-4 py-3 sm:px-5">
                  <AddToCalendar
                    icsHref={`/api/learn/events/${event.slug}/ics`}
                    googleHref={googleHref}
                  />
                </div>
              ) : null}
            </Card>
          )}
        </div>

        {event.description ? (
          <Section title="About this class">
            <RichText body={event.description} className="text-reading text-foreground" />
          </Section>
        ) : null}

        {event.attendees.length > 0 ? (
          <Section
            title={event.past ? "Who came" : "Who's coming"}
            count={event.goingCount}
          >
            <ul className="flex flex-wrap gap-2">
              {event.attendees.map((person) => (
                <li key={person.handle} className="min-w-0">
                  <Link
                    href={`/members/${person.handle}`}
                    title={person.name}
                    className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-border bg-surface pl-1 pr-3 text-label text-foreground no-underline shadow-e1 transition hover:border-hairline-firm"
                  >
                    <Avatar name={person.name} src={person.image} size="xs" />
                    <span className="max-w-40 truncate">{person.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {event.goingCount > event.attendees.length ? (
              <p className="text-label text-foreground-muted">
                and {event.goingCount - event.attendees.length} more.
              </p>
            ) : null}
          </Section>
        ) : null}

        {event.siblings.length > 0 ? (
          <Section title="More dates">
            <Card as="div" padding="none" className="overflow-hidden">
              <ul className="divide-y divide-separator">
                {event.siblings.map((sibling) => (
                  <li key={sibling.slug}>
                    <Link href={liveClassHref(sibling.slug)} className={ROW}>
                      <CalendarClock
                        className="size-4 shrink-0 text-foreground-muted"
                        aria-hidden
                      />
                      <EventTime
                        startsAt={sibling.startsAt}
                        eventTimeZone={event.timezone}
                        viewerTimeZone={timeZone}
                        showZone={false}
                        className="min-w-0 flex-1 tabular-nums"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        ) : null}

        {event.discussion ? (
          <div>
            <ButtonLink href={`/posts/${event.discussion.id}`}>
              <MessagesSquare className="size-4" aria-hidden />
              Join the conversation
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
