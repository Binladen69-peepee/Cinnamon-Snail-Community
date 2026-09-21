import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  FileText,
  Lock,
  MessageSquare,
  PlayCircle,
} from "lucide-react";
import { auth } from "@/auth";
import { getClassDetail } from "@/lib/learn/library";
import { AppShell } from "@/components/app/app-shell";
import { ClassPlayer } from "@/components/learn/class-player";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user.id) return { title: "Class" };
  const detail = await getClassDetail(slug, session.user.id);
  return { title: detail?.title ?? "Class" };
}

/**
 * One class.
 *
 * The destination three other places already pointed at — search results, the
 * marketing class library's `classDetailHref`, and Discover's cards — all of
 * which 404'd until now.
 *
 * There are no lessons in the database yet, so the page is built around what is
 * real: the still, the teaser, and what the class is. The lesson list and the
 * resource list render themselves when those rows exist and say nothing at all
 * when they do not, rather than showing an empty syllabus. Playback is gated on
 * a live membership; the teaser is not, because it is marketing.
 */
export default async function ClassPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const cls = await getClassDetail(slug, session.user.id);
  if (!cls) notFound();

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[900px] space-y-4 pb-6">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All classes
        </Link>

        <ClassPlayer
          photo={cls.photo}
          teaserEmbed={cls.teaserEmbed}
          title={cls.title}
        />

        <header className="space-y-2">
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {cls.title}
          </h1>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold text-foreground-muted">
            {cls.category ? (
              <Link
                href={`/learn?category=${encodeURIComponent(cls.category)}`}
                className="text-brand no-underline hover:underline"
              >
                {cls.category}
              </Link>
            ) : null}
            {cls.instructor ? (
              <span className="inline-flex items-center gap-1">
                <ChefHat className="size-3" aria-hidden />
                {cls.instructor}
              </span>
            ) : null}
            {cls.length ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="size-3" aria-hidden />
                {cls.length} teaser
              </span>
            ) : null}
            {cls.lessonCount > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <PlayCircle className="size-3" aria-hidden />
                {cls.lessonCount}{" "}
                {cls.lessonCount === 1 ? "lesson" : "lessons"}
              </span>
            ) : null}
          </p>

          {cls.description ? (
            <p className="text-[15px] leading-relaxed text-foreground-muted">
              {cls.description}
            </p>
          ) : null}
        </header>

        {cls.lessonCount > 0 && cls.percent > 0 ? (
          <div className="rounded-card border border-border bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2 text-[12.5px] font-semibold">
              <span className="text-foreground">Your progress</span>
              <span className="tabular-nums text-foreground-muted">
                {cls.completedCount} of {cls.lessonCount} · {cls.percent}%
              </span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-default"
              role="progressbar"
              aria-valuenow={cls.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${cls.title} progress`}
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${cls.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        {!cls.entitled ? (
          <p className="flex items-start gap-2 rounded-card border border-border bg-brand-wash px-3.5 py-3 text-[13.5px] text-brand-strong">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Your membership is not active, so the full class will not play.
              The teaser above is free to watch.{" "}
              <Link href="/billing" className="font-semibold underline">
                Check your membership
              </Link>
            </span>
          </p>
        ) : null}

        {cls.sections.length > 0 ? (
          <section className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              In this class
            </h2>
            <div className="space-y-3">
              {cls.sections.map((section) => (
                <div
                  key={section.id}
                  className="overflow-hidden rounded-card border border-border bg-surface"
                >
                  <h3 className="border-b border-border px-3.5 py-2.5 text-[13.5px] font-bold text-foreground">
                    {section.title}
                  </h3>
                  <ul>
                    {section.lessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0"
                      >
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full",
                            lesson.completed
                              ? "bg-brand text-on-brand"
                              : "bg-default text-foreground-muted",
                          )}
                          aria-hidden
                        >
                          {lesson.completed ? (
                            <Check className="size-3.5" />
                          ) : lesson.playable ? (
                            <PlayCircle className="size-4" />
                          ) : (
                            <Lock className="size-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                          {lesson.title}
                        </span>
                        {lesson.durationMin ? (
                          <span className="shrink-0 text-[12px] tabular-nums text-foreground-muted">
                            {lesson.durationMin} min
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-[13.5px] text-foreground-muted">
            The full cook-along for this class is not on the platform yet. The
            teaser above is the real thing — the rest follows as Adam moves his
            catalog across.
          </p>
        )}

        {cls.resources.length > 0 ? (
          <section className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              Recipes and downloads
            </h2>
            <ul className="space-y-2">
              {cls.resources.map((resource) => (
                <li key={resource.id}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3.5 py-2.5 text-[14px] text-foreground no-underline transition hover:border-hairline-firm"
                  >
                    <FileText className="size-4 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {resource.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {cls.discussHref ? (
          <Link
            href={cls.discussHref}
            className="inline-flex h-10 items-center gap-2 rounded-ctl bg-brand-fill px-4 text-[14px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
          >
            <MessageSquare className="size-4" aria-hidden />
            Talk about this class
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
