import Link from "next/link";
import { CalendarClock, Info } from "lucide-react";
import { Card, CardHeader } from "@/components/app/ui";
import { STATUS_ICON } from "@/components/ideas/idea-badges";
import {
  IDEA_STATUSES,
  IDEA_STATUS_VALUES,
  ideasHref,
} from "@/lib/ideas/constants";
import type { IdeaListItem } from "@/lib/ideas/queries";

/**
 * The board's side rail on wide screens: what is on the way, and how the
 * board works. Nothing here is needed to use the board, which is why it is
 * allowed to disappear on a phone.
 */
export function IdeasRail({ planned }: { planned: IdeaListItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      {planned.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader
            title="On the way"
            icon={<CalendarClock />}
            action={
              <Link
                href={ideasHref({ sort: "planned" })}
                className="text-caption font-medium text-link no-underline hover:underline"
              >
                All planned
              </Link>
            }
          />
          <ul className="divide-y divide-separator">
            {planned.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/ideas/${idea.id}`}
                  className="block px-4 py-3 no-underline transition hover:bg-surface-muted"
                >
                  <span className="line-clamp-2 text-label font-medium leading-snug text-foreground">
                    {idea.title}
                  </span>
                  <span className="mt-1 block text-caption tabular-nums text-foreground-muted">
                    {idea.score} {idea.score === 1 ? "vote" : "votes"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card padding="none" className="overflow-hidden">
        <CardHeader title="How the board works" icon={<Info />} />
        <div className="flex flex-col gap-3 px-4 py-3.5 text-label text-foreground-muted">
          <p>
            One vote each, on as many ideas as you like. Your own idea carries your vote from
            the start.
          </p>
          <p>
            Before you post, the form shows ideas that look the same, so a request gathers its
            votes in one place.
          </p>
          <ul className="flex flex-col gap-2 pt-1">
            {IDEA_STATUS_VALUES.map((status) => {
              const Icon = STATUS_ICON[status];
              return (
                <li key={status} className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-medium text-foreground">
                      {IDEA_STATUSES[status].label}.
                    </span>{" "}
                    {IDEA_STATUSES[status].description}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </div>
  );
}
