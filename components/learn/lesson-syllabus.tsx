"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  ChevronDown,
  FileDown,
  FileText,
  Headphones,
  ListChecks,
  PlayCircle,
  Radio,
} from "lucide-react";
import type { LessonKind } from "@prisma/client";
import type { ClassSection } from "@/lib/learn/library";
import {
  Badge,
  ProgressBar,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { StepMark } from "@/components/learn/step-mark";
import { cn } from "@/lib/utils";

/**
 * The syllabus beside the player.
 *
 * On a phone it is a disclosure that starts closed — a fourteen-lesson list
 * above the video would push the video off the screen, which is the one thing
 * a lesson page must not do. From `lg` up it is a side card that is simply
 * there, sticky below the header, and it scrolls on its own so a long course
 * cannot push the player out of view.
 *
 * The course link and the toggle are siblings rather than one inside the
 * other: a link inside a button is two controls pretending to be one, and the
 * tap landed on whichever the browser guessed.
 *
 * A locked lesson is still listed. Hiding it would leave a member unable to
 * see what they are missing, which is neither honest nor useful; it is shown
 * with a padlock and is not a link.
 */

const KIND_ICON: Record<LessonKind, typeof PlayCircle> = {
  VIDEO: PlayCircle,
  TEXT: FileText,
  AUDIO: Headphones,
  DOWNLOAD: FileDown,
  QUIZ: ListChecks,
  LIVE: Radio,
};

export function LessonSyllabus({
  sections,
  currentLessonId,
  courseTitle,
  courseHref,
  completedCount,
  lessonCount,
  percent,
}: {
  sections: ClassSection[];
  currentLessonId: string;
  courseTitle: string;
  courseHref: string;
  completedCount: number;
  lessonCount: number;
  percent: number;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div
      className={cardClass({
        padding: "none",
        className: "overflow-hidden lg:sticky lg:top-18",
      })}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={courseHref}
              className="block truncate text-body font-semibold text-foreground no-underline hover:underline"
            >
              {courseTitle}
            </Link>
            <span className="mt-0.5 block text-caption tabular-nums text-foreground-muted">
              {completedCount} of {lessonCount} done · {percent}%
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={listId}
            aria-label={open ? "Hide lessons" : "Show lessons"}
            className={buttonClass({
              variant: "ghost",
              size: "sm",
              iconOnly: true,
              className: "lg:hidden",
            })}
          >
            <ChevronDown
              className={cn("size-4 transition", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
        <ProgressBar
          value={percent}
          label={`${courseTitle} progress`}
          size="sm"
        />
      </div>

      <div
        id={listId}
        className={cn(
          "border-t border-separator py-1 lg:max-h-[min(66dvh,40rem)] lg:overflow-y-auto",
          open ? "block" : "hidden lg:block",
        )}
      >
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="px-4 pb-1 pt-3 text-caption font-semibold text-foreground-muted">
              {section.title}
            </h2>
            <ul className="pb-1">
              {section.lessons.map((lesson) => {
                const Icon = KIND_ICON[lesson.kind] ?? PlayCircle;
                const current = lesson.id === currentLessonId;
                const locked = lesson.gate.state !== "open";
                const inner = (
                  <>
                    <StepMark
                      size="sm"
                      state={
                        lesson.completed ? "done" : locked ? "locked" : "open"
                      }
                    >
                      <Icon />
                    </StepMark>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-label",
                          current
                            ? "font-semibold text-on-brand-wash"
                            : "text-foreground",
                        )}
                      >
                        {lesson.title}
                      </span>
                      {lesson.durationMin ? (
                        <span className="block text-caption tabular-nums text-foreground-muted">
                          {lesson.durationMin} min
                        </span>
                      ) : null}
                    </span>
                    {lesson.isPreview && locked ? (
                      <Badge tone="outline">Free</Badge>
                    ) : null}
                  </>
                );

                return (
                  <li key={lesson.id} className="px-1.5">
                    {locked ? (
                      <span
                        aria-disabled="true"
                        title={
                          lesson.gate.state === "locked"
                            ? "Members only"
                            : "Nothing to play here yet"
                        }
                        className="flex items-center gap-2.5 rounded-ctl px-2.5 py-2 opacity-60"
                      >
                        {inner}
                      </span>
                    ) : (
                      <Link
                        href={lesson.href}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-ctl px-2.5 py-2 no-underline transition",
                          current ? "bg-brand-wash" : "hover:bg-surface-muted",
                        )}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
