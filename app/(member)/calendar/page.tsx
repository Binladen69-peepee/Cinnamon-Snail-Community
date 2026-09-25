import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { EventListCard } from "@/components/events/event-card";
import { MonthGrid } from "@/components/events/month-grid";
import { loadCalendarList, loadCalendarMonth } from "@/lib/events/queries";
import { getEventViewer } from "@/lib/events/access";
import { safeTimeZone, zonedDayKey, zonedParts } from "@/lib/events/timezone";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar" };

/**
 * The campus calendar.
 *
 * The route four other surfaces already pointed at — the space events tab,
 * Discover's event cards, `searchHref('event')` and the notification href —
 * all of which 404'd until now.
 *
 * Two views of the same rows. The month grid answers "what is this week
 * shaped like"; the list answers "what is next, and can I come". Which one
 * you are on lives in the URL, so a view is a link and the back button works.
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

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[1000px] space-y-4 pb-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
                Calendar
              </h1>
              <p className="mt-1 text-[13.5px] text-foreground-muted">
                Live cook-alongs and gatherings, in your own time zone
                <span className="hidden sm:inline"> ({timeZone})</span>.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1 rounded-ctl border border-border bg-surface p-0.5">
              <ViewTab href="/calendar?view=list" active={view === "list"}>
                <List className="size-3.5" aria-hidden />
                List
              </ViewTab>
              <ViewTab href="/calendar?view=month" active={view === "month"}>
                <CalendarDays className="size-3.5" aria-hidden />
                Month
              </ViewTab>
            </div>
          </div>

          {view === "month" ? (
            <div className="flex items-center justify-between gap-2">
              <MonthStep
                href={`/calendar?view=month&month=${monthParam(step(cursorMonth, -1))}`}
                label="Previous month"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </MonthStep>
              <h2 className="text-[14px] font-bold text-foreground">{monthLabel}</h2>
              <MonthStep
                href={`/calendar?view=month&month=${monthParam(step(cursorMonth, 1))}`}
                label="Next month"
              >
                <ChevronRight className="size-4" aria-hidden />
              </MonthStep>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <WhenTab href="/calendar?view=list&when=upcoming" active={when === "upcoming"}>
                Upcoming
              </WhenTab>
              <WhenTab href="/calendar?view=list&when=past" active={when === "past"}>
                Past
              </WhenTab>
            </div>
          )}
        </header>

        {view === "month" && monthData ? (
          <>
            <MonthGrid
              year={monthData.year}
              month={monthData.month}
              byDay={monthData.byDay}
              todayKey={zonedDayKey(new Date(), timeZone)}
            />
            {monthData.events.length === 0 ? (
              <Blank
                title={`Nothing in ${monthLabel}`}
                body="Live classes and gatherings appear here as they are scheduled."
              />
            ) : (
              <section className="space-y-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                  This month
                </h2>
                <ul className="space-y-2">
                  {monthData.events.map((event) => (
                    <li key={event.id}>
                      <EventListCard event={event} viewerTimeZone={timeZone} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : null}

        {view === "list" && listData ? (
          listData.events.length === 0 ? (
            <Blank
              title={when === "upcoming" ? "Nothing scheduled yet" : "Nothing has happened yet"}
              body={
                when === "upcoming"
                  ? "Live cook-alongs and gatherings appear here as they are scheduled. You will be reminded a day and an hour before anything you say yes to."
                  : "Past classes appear here once they have run, with their recordings attached."
              }
            />
          ) : (
            <>
              <ul className="space-y-2.5">
                {listData.events.map((event) => (
                  <li key={event.id}>
                    <EventListCard event={event} viewerTimeZone={timeZone} />
                  </li>
                ))}
              </ul>
              {listData.nextCursor ? (
                <Link
                  href={`/calendar?view=list&when=${when}&cursor=${listData.nextCursor}`}
                  className="mx-auto flex h-10 w-full max-w-[18rem] items-center justify-center rounded-ctl border border-border bg-surface text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
                >
                  Show more
                </Link>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </AppShell>
  );
}

function parseMonth(value: string | undefined): { year: number; month: number } | null {
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

function ViewTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-ctl px-3 text-[12.5px] font-semibold no-underline transition",
        active
          ? "bg-brand-fill text-brand-fill-foreground"
          : "text-foreground-muted hover:bg-mint hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function WhenTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-semibold no-underline transition",
        active
          ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
          : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function MonthStep({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-8 place-items-center rounded-ctl border border-border bg-surface text-foreground-muted no-underline transition hover:border-hairline-firm hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function Blank({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
        <CalendarDays className="size-6" aria-hidden />
      </span>
      <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] text-foreground-muted">
        {body}
      </p>
    </div>
  );
}
