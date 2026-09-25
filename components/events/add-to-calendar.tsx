"use client";

import { useState } from "react";
import { CalendarPlus, Check, Download, ExternalLink } from "lucide-react";

/**
 * Getting the event into the member's own calendar.
 *
 * Both routes are offered because people genuinely split between them: a
 * download for Apple Calendar, Outlook and everything else, and a link for
 * the people already living in Google Calendar.
 *
 * The Google URL is built on the server and passed in, so the two cannot
 * disagree about the time — building it here from a Date would use the
 * browser's zone and quietly produce a different entry from the `.ics`.
 */
export function AddToCalendar({
  icsHref,
  googleHref,
}: {
  icsHref: string;
  googleHref: string;
}) {
  const [taken, setTaken] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={icsHref}
        onClick={() => setTaken(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-ctl border border-border bg-surface px-3.5 text-[13px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
      >
        {taken ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Download className="size-3.5" aria-hidden />
        )}
        Download .ics
      </a>

      <a
        href={googleHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-ctl border border-border bg-surface px-3.5 text-[13px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
      >
        <CalendarPlus className="size-3.5" aria-hidden />
        Google Calendar
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}
