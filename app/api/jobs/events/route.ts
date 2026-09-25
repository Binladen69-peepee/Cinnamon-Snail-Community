import { NextResponse } from "next/server";
import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { materialiseRecurringEvents, sendEventReminders } from "@/lib/events/jobs";

/**
 * The calendar's timer.
 *
 * Two jobs in one call, because they belong to the same cadence and the Hobby
 * plan allows one cron run a day: reminders for events that are nearly here,
 * and more occurrences for series that are running out of them.
 *
 * Both are safe to call at any frequency and safe to call twice at once.
 * Reminders claim an `EventReminder` row before sending, so a duplicate run
 * inserts nothing; occurrence generation only creates dates that are not
 * already there. Running it every five minutes would make the one-hour
 * reminder punctual, and that is the only thing a finer cadence buys.
 *
 * Gated by the same secret as every other `/api/jobs/*` route.
 */
export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const job = new URL(request.url).searchParams.get("job");

  // Occurrences first: a series that just grew a new date should be able to
  // remind people about it in the same run.
  const recurrence =
    job === "reminders" ? null : await materialiseRecurringEvents();
  const reminders = job === "recurrence" ? null : await sendEventReminders();

  return NextResponse.json({ ok: true, recurrence, reminders });
}

/** Vercel Cron issues a GET, so the same work is reachable both ways. */
export async function GET(request: Request) {
  return POST(request);
}
