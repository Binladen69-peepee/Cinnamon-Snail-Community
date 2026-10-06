import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  List,
  PlayCircle,
  Video,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  ChipRow,
  EmptyState,
  PageHeader,
  Section,
  Segmented,
  chipClass,
  segmentClass,
} from "@/components/app/ui";
import { LiveClassCard, PastClassList } from "@/components/events/event-card";
import { ViewerZoneName } from "@/components/events/event-time";
import { JoinWindowRefresh } from "@/components/events/join-window-refresh";
import { MonthGrid, dayAnchor } from "@/components/events/month-grid";
import { getEventViewer } from "@/lib/events/access";
import { nextJoinChange } from "@/lib/events/join";
import { LIVE_CLASSES_PATH } from "@/lib/events/paths";
import { loadCalendarList, loadCalendarMonth } from "@/lib/events/queries";
import { safeTimeZone, zonedDayKey, zonedParts } from "@/lib/events/timezone";
import { refreshZoomIfStale } from "@/lib/zoom/refresh";

export const metadata = { title: "Live Classes" };

/**
 * Live Classes (DEC-079): the page the client's Mighty Networks "Live
 * Classes" tab was, rebuilt here.
 *
 * Upcoming classes first, soonest at the top, each with its date and time in
 * the member's own zone, its host, what it is about, the RSVP, and "Join on
 * Zoom" once the doors open. Under them, the classes that already ran and have
 * a recording to catch up on; "Past classes" lists them all. The month grid
 * stays as a second view for anyone planning ahead.
 *
 * Classes arrive from Zoom on their own (any meeting whose topic says LIVE
 * CLASS) or from staff by hand, and read the same either way. Everything is in
 * the URL, so a view is a link and the back button works.
 */
export default async function LiveClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    month?: string;
    when?: string;
    cursor?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const viewer = await getEventViewer(session.user.id);
  if (!viewer) redirect("/login");

  // Between the daily scheduled runs, a look at Zoom at most once an hour.
  // After the response: this visit shows what is stored, the next one the update.
  after(() =>
    refreshZoomIfStale().then(
      () => undefined,
      (error: unknown) =>
        console.error(
          "[zoom] visit refresh failed:",
          error instanceof Error ? error.message.slice(0, 200) : "unknown error",
        ),
    ),
  );

  const timeZone = safeTimeZone(viewer.timeZone);
  const view = params.view === "month" ? "month" : "list";
  const when = params.when === "past" ? "past" : "upcoming";
  const cursor = typeof params.cursor === "string" && params.cursor.length <= 200 ? params.cursor : null;

  const today = zonedParts(new Date(), timeZone);
  const cursorMonth = parseMonth(params.month) ?? {
    year: today.year,
    month: today.month,
  };

  const [monthData, listData, catchUp] = await Promise.all([
    view === "month"
      ? loadCalendarMonth({
          userId: session.user.id,
          year: cursorMonth.year,
          month: cursorMonth.month,
          timeZone,
        })
      : Promise.resolve(null),
    view === "list"
      ? loadCalendarList({
          userId: session.user.id,
          direction: when,
          cursor,
          timeZone,
        })
      : Promise.resolve(null),
    // The first page of upcoming classes ends with what there is to catch up on.
    view === "list" && when === "upcoming" && !cursor
      ? loadCalendarList({
          userId: session.user.id,
          direction: "past",
          withRecordingOnly: true,
          take: 4,
          timeZone,
        })
      : Promise.resolve(null),
  ]);

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursorMonth.year, cursorMonth.month - 1, 1)));

  // The first class of each day in the month list gets that day's anchor.
  const anchored = new Set<string>();

  const onScreen = [...(listData?.events ?? []), ...(monthData?.events ?? [])];
  const refreshAt = nextJoinChange(
    onScreen.map((event) => event.join),
    new Date(),
  );

  return (
    <AppShell size="page">
      <JoinWindowRefresh at={refreshAt ? refreshAt.toISOString() : null} />
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Live Classes"
          description={
            <>
              Cook along with us, live on Zoom. Times are shown in your time zone
              <span className="hidden sm:inline">
                {" "}
                (<ViewerZoneName viewerTimeZone={timeZone} />)
              </span>
              .
            </>
          }
          actions={
            <Segmented label="How to show live classes">
              <Link
                href={`${LIVE_CLASSES_PATH}?view=list`}
                aria-current={view === "list" ? "page" : undefined}
                className={segmentClass(view === "list")}
              >
                <List aria-hidden />
                List
              </Link>
              <Link
                href={`${LIVE_CLASSES_PATH}?view=month`}
                aria-current={view === "month" ? "page" : undefined}
                className={segmentClass(view === "month")}
              >
                <CalendarDays aria-hidden />
                Month
              </Link>
            </Segmented>
          }
        >
          {view === "month" ? (
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-title font-semibold tabular-nums text-foreground">
                {monthLabel}
              </h2>
              <div className="flex items-center gap-1.5">
                <ButtonLink
                  href={`${LIVE_CLASSES_PATH}?view=month&month=${monthParam(step(cursorMonth, -1))}`}
                  aria-label="Previous month"
                  size="sm"
                  iconOnly
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink
                  href={`${LIVE_CLASSES_PATH}?view=month&month=${monthParam(step(cursorMonth, 1))}`}
                  aria-label="Next month"
                  size="sm"
                  iconOnly
                >
                  <ChevronRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            </div>
          ) : (
            <ChipRow label="Which classes">
              <Link
                href={`${LIVE_CLASSES_PATH}?view=list&when=upcoming`}
                aria-current={when === "upcoming" ? "page" : undefined}
                className={chipClass(when === "upcoming")}
              >
                Upcoming
              </Link>
              <Link
                href={`${LIVE_CLASSES_PATH}?view=list&when=past`}
                aria-current={when === "past" ? "page" : undefined}
                className={chipClass(when === "past")}
              >
                Past classes
              </Link>
            </ChipRow>
          )}
        </PageHeader>

        {view === "month" && monthData ? (
          <>
            <MonthGrid
              year={monthData.year}
              month={monthData.month}
              byDay={monthData.byDay}
              todayKey={zonedDayKey(new Date(), timeZone)}
            />
            {monthData.events.length === 0 ? (
              <EmptyState
                icon={<CalendarDays />}
                title={`No live classes in ${monthLabel}`}
                description="Classes appear here as soon as they are scheduled."
              />
            ) : (
              <Section title="This month" count={monthData.events.length}>
                <ul className="flex flex-col gap-3">
                  {monthData.events.map((event) => {
                    const key = zonedDayKey(event.startsAt, timeZone);
                    const first = !anchored.has(key);
                    anchored.add(key);
                    return (
                      <li
                        key={event.id}
                        id={first ? dayAnchor(key) : undefined}
                        className="scroll-mt-20"
                      >
                        <LiveClassCard event={event} viewerTimeZone={timeZone} />
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </>
        ) : null}

        {view === "list" && listData && when === "upcoming" ? (
          <>
            {listData.events.length === 0 ? (
              <EmptyState
                icon={<Video />}
                title="No live classes scheduled yet"
                description="New classes appear here as soon as they are scheduled. Say you're going to one and you'll be reminded a day and an hour before."
              />
            ) : (
              <Section title={cursor ? "More upcoming classes" : "Coming up"}>
                <ul className="flex flex-col gap-3">
                  {listData.events.map((event) => (
                    <li key={event.id}>
                      <LiveClassCard event={event} viewerTimeZone={timeZone} />
                    </li>
                  ))}
                </ul>
                {listData.nextCursor ? (
                  <ButtonLink
                    href={`${LIVE_CLASSES_PATH}?view=list&when=upcoming&cursor=${listData.nextCursor}`}
                    className="mx-auto w-full max-w-72"
                  >
                    Show more
                  </ButtonLink>
                ) : null}
              </Section>
            )}

            {catchUp && catchUp.events.length > 0 ? (
              <Section
                title="Catch up on recordings"
                icon={<PlayCircle />}
                action={
                  <Link
                    href={`${LIVE_CLASSES_PATH}?view=list&when=past`}
                    className="text-label font-medium text-link no-underline hover:underline"
                  >
                    All past classes
                  </Link>
                }
              >
                <PastClassList events={catchUp.events} viewerTimeZone={timeZone} />
              </Section>
            ) : null}
          </>
        ) : null}

        {view === "list" && listData && when === "past" ? (
          listData.events.length === 0 ? (
            <EmptyState
              icon={<History />}
              title="No past classes yet"
              description="Classes appear here once they have run, with the recording when there is one."
            />
          ) : (
            <Section title="Past classes">
              <PastClassList events={listData.events} viewerTimeZone={timeZone} />
              {listData.nextCursor ? (
                <ButtonLink
                  href={`${LIVE_CLASSES_PATH}?view=list&when=past&cursor=${listData.nextCursor}`}
                  className="mx-auto w-full max-w-72"
                >
                  Show more
                </ButtonLink>
              ) : null}
            </Section>
          )
        ) : null}
      </div>
    </AppShell>
  );
}

function parseMonth(
  value: string | undefined,
): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

function monthParam(value: { year: number; month: number }): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
}

function step(
  value: { year: number; month: number },
  by: number,
): { year: number; month: number } {
  const moved = new Date(Date.UTC(value.year, value.month - 1 + by, 1));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1 };
}
