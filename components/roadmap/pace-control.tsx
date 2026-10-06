"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { segmentClass } from "@/components/app/ui";
import {
  WEEKS_PER_TOPIC_OPTIONS,
  isWeeksPerTopic,
  weeksLabel,
  type WeeksPerTopic,
} from "@/lib/roadmap/pacing";
import { cn } from "@/lib/utils";

/**
 * The pace control's four segments: 1, 2, 3 or 4 weeks per topic (DEC-080).
 *
 * Each segment is a submit button carrying its own value, so one tap saves the
 * pace with no separate Save step — and, being a plain form, it works before
 * the page hydrates. Render it inside a `<form action={setPaceAction}>`.
 *
 * Once hydrated it shows the tapped pace as chosen straight away and holds the
 * other segments while the save runs, so a double tap cannot write twice. The
 * pace already in force is `aria-pressed` and does not resubmit.
 */
export function PaceSegments({
  value,
  label,
  describedBy,
}: {
  value: WeeksPerTopic;
  /** Spoken name of the group. */
  label: string;
  describedBy?: string;
}) {
  const { pending, data } = useFormStatus();
  const asked = pending ? Number(data?.get("weeksPerTopic")) : null;
  const shown = isWeeksPerTopic(asked) ? asked : value;

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      aria-busy={pending || undefined}
      className="grid w-full grid-cols-4 gap-0.5 rounded-ctl bg-default p-0.5 sm:w-fit"
    >
      {WEEKS_PER_TOPIC_OPTIONS.map((weeks) => {
        const current = weeks === value;
        return (
          <button
            key={weeks}
            type={current ? "button" : "submit"}
            name={current ? undefined : "weeksPerTopic"}
            value={current ? undefined : String(weeks)}
            aria-pressed={current}
            disabled={pending && !current}
            className={segmentClass(
              weeks === shown,
              cn(
                "h-9 min-w-0 px-1 tabular-nums disabled:cursor-wait sm:px-4",
                current && "cursor-default",
              ),
            )}
          >
            {pending && weeks === asked ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            {weeksLabel(weeks)}
          </button>
        );
      })}
    </div>
  );
}
