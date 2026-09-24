"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  FileDown,
  FileText,
  Headphones,
  ListChecks,
  Lock,
  PlayCircle,
  Radio,
} from "lucide-react";
import type { LessonKind } from "@prisma/client";
import type { ClassSection } from "@/lib/learn/library";
import { cn } from "@/lib/utils";

/**
 * The syllabus beside the player.
 *
 * On a phone it is a disclosure that starts closed — a fourteen-lesson list
 * above the video would push the video off the screen, which is the one thing
 * a lesson page must not do. From `lg` up it is simply there, and it scrolls
 * on its own so a long course cannot push the player out of view.
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

  return (
    <div className="rounded-card border border-border bg-surface lg:sticky lg:top-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b border-border px-3.5 py-3 text-left lg:cursor-default lg:pointer-events-none"
      >
        <span className="min-w-0 flex-1">
          <Link
            href={courseHref}
            onClick={(event) => event.stopPropagation()}
            className="block truncate text-[13.5px] font-bold text-foreground no-underline hover:underline lg:pointer-events-auto"
          >
            {courseTitle}
          </Link>
          <span className="mt-0.5 block text-[12px] tabular-nums text-foreground-muted">
            {completedCount} of {lessonCount} done · {percent}%
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-foreground-muted transition lg:hidden",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <div
        className="h-1 overflow-hidden bg-default"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${courseTitle} progress`}
      >
        <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
      </div>

      <div
        className={cn(
          "lg:max-h-[min(66vh,40rem)] lg:overflow-y-auto",
          open ? "block" : "hidden lg:block",
        )}
      >
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="px-3.5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              {section.title}
            </h2>
            <ul className="pb-1">
              {section.lessons.map((lesson) => {
                const Icon = KIND_ICON[lesson.kind] ?? PlayCircle;
                const current = lesson.id === currentLessonId;
                const locked = lesson.gate.state !== "open";
                const inner = (
                  <>
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full",
                        lesson.completed
                          ? "bg-brand text-on-brand"
                          : "bg-default text-foreground-muted",
                      )}
                      aria-hidden
                    >
                      {lesson.completed ? (
                        <Check className="size-3" />
                      ) : locked ? (
                        <Lock className="size-3" />
                      ) : (
                        <Icon className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">
                        {lesson.title}
                      </span>
                      {lesson.durationMin ? (
                        <span className="block text-[11.5px] tabular-nums text-foreground-muted">
                          {lesson.durationMin} min
                        </span>
                      ) : null}
                    </span>
                    {lesson.isPreview && locked ? (
                      <span className="shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-[10.5px] font-bold text-foreground-muted">
                        Free
                      </span>
                    ) : null}
                  </>
                );

                return (
                  <li key={lesson.id}>
                    {locked ? (
                      <span
                        aria-disabled="true"
                        title={
                          lesson.gate.state === "locked"
                            ? "Members only"
                            : "Nothing to play here yet"
                        }
                        className="flex items-center gap-2.5 px-3.5 py-2 opacity-55"
                      >
                        {inner}
                      </span>
                    ) : (
                      <Link
                        href={lesson.href}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 px-3.5 py-2 no-underline transition hover:bg-mint",
                          current && "bg-brand-wash",
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
