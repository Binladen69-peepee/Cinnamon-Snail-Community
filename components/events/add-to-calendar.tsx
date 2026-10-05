"use client";

import { useState } from "react";
import { CalendarPlus, Check, Download, ExternalLink } from "lucide-react";
import { buttonClass } from "@/components/app/ui";

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
 *
 * Plain anchors styled as small secondary buttons: one is a file and the
 * other leaves the site, so neither is a client-side navigation.
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
        className={buttonClass({ size: "sm" })}
      >
        {taken ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        Download .ics
      </a>

      <a
        href={googleHref}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ size: "sm" })}
      >
        <CalendarPlus className="size-4" aria-hidden />
        Google Calendar
        <ExternalLink className="size-3.5 text-foreground-muted" aria-hidden />
      </a>
    </div>
  );
}
