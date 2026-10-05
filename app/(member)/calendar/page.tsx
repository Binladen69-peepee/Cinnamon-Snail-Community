import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  List,
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
import { EventListCard } from "@/components/events/event-card";
import { MonthGrid, dayAnchor } from "@/components/events/month-grid";
import { loadCalendarList, loadCalendarMonth } from "@/lib/events/queries";
import { getEventViewer } from "@/lib/events/access";
import { safeTimeZone, zonedDayKey, zonedParts } from "@/lib/events/timezone";

export const metadata = { title: "Calendar" };

/**
 * The campus calendar.
 *
 * The route four other surfaces already pointed at — the space events tab,
 * the event cards, `searchHref('event')` and the notification href —
 * all of which 404'd until now.
 *
 * Two views of the same rows. The month grid answers "what is this week
 * shaped like"; the list answers "what is next, and can I come". Which one
 * you are on lives in the URL, so a view is a link and the back button works.
 * Under the grid, each day's first event carries an anchor, which is where a
 * tap on that day in the grid lands on a phone.
 *
 * Everything renders in the member's own timezone, taken from their profile
 * on the server and corrected by the browser on the client.
 */
export default async function CalendarPage({
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

  const timeZone = safeTimeZone(viewer.timeZone);
  const view = params.view === "month" ? "month" : "list";
  const when = params.when === "past" ? "past" : "upcoming";

  const today = zonedParts(new Date(), timeZone);
  const cursorMonth = parseMonth(params.month) ?? {
    year: today.year,
    month: today.month,
  };

  const [monthData, listData] = await Promise.all([
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
          cursor: params.cursor ?? null,
          timeZone,
        })
      : Promise.resolve(null),
  ]);

  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursorMonth.year, cursorMonth.month - 1, 1)));

  // The first event of each day in the month list gets that day's anchor.
  const anchored = new Set<string>();

  return (
    <AppShell size="page">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Calendar"
          description={
            <>
              Live cook-alongs and gatherings, in your own time zone
              <span className="hidden sm:inline"> ({timeZone})</span>.
            </>
          }
          actions={
            <Segmented label="Calendar view">
              <Link
                href="/calendar?view=list"
                aria-current={view === "list" ? "page" : undefined}
                className={segmentClass(view === "list")}
              >
                <List aria-hidden />
                List
              </Link>
              <Link
                href="/calendar?view=month"
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
                  href={`/calendar?view=month&month=${monthParam(step(cursorMonth, -1))}`}
                  aria-label="Previous month"
                  size="sm"
                  iconOnly
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink
                  href={`/calendar?view=month&month=${monthParam(step(cursorMonth, 1))}`}
                  aria-label="Next month"
                  size="sm"
                  iconOnly
                >
                  <ChevronRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            </div>
          ) : (
            <ChipRow>
              <Link
                href="/calendar?view=list&when=upcoming"
                aria-current={when === "upcoming" ? "page" : undefined}
                className={chipClass(when === "upcoming")}
              >
                Upcoming
              </Link>
              <Link
                href="/calendar?view=list&when=past"
                aria-current={when === "past" ? "page" : undefined}
                className={chipClass(when === "past")}
              >
                Past
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
                title={`Nothing in ${monthLabel}`}
                description="Live classes and gatherings appear here as they are scheduled."
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
                        <EventListCard
                          event={event}
                          viewerTimeZone={timeZone}
                        />
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}
          </>
        ) : null}

        {view === "list" && listData ? (
          listData.events.length === 0 ? (
            <EmptyState
              icon={when === "upcoming" ? <CalendarDays /> : <History />}
              title={
                when === "upcoming"
                  ? "Nothing scheduled yet"
                  : "Nothing has happened yet"
              }
              description={
                when === "upcoming"
                  ? "Live cook-alongs and gatherings appear here as they are scheduled. You will be reminded a day and an hour before anything you say yes to."
                  : "Past classes appear here once they have run, with their recordings attached."
              }
            />
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {listData.events.map((event) => (
                  <li key={event.id}>
                    <EventListCard event={event} viewerTimeZone={timeZone} />
                  </li>
                ))}
              </ul>
              {listData.nextCursor ? (
                <ButtonLink
                  href={`/calendar?view=list&when=${when}&cursor=${listData.nextCursor}`}
                  className="mx-auto w-full max-w-72"
                >
                  Show more
                </ButtonLink>
              ) : null}
            </>
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
