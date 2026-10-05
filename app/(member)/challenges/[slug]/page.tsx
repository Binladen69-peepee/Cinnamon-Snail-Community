import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, Lock, Sparkles, Undo2 } from "lucide-react";
import { auth } from "@/auth";
import { challengeErrorText, loadChallenge } from "@/lib/challenges";
import { AppShell } from "@/components/app/app-shell";
import {
  joinAction,
  leaveAction,
  markDoneAction,
  unmarkDoneAction,
} from "@/app/(member)/challenges/actions";
import { Progress } from "@/app/(member)/challenges/page";

export const dynamic = "force-dynamic";

/**
 * One challenge: the prompts, and a member's own progress through them.
 *
 * Prompts unlock on their day rather than arriving all at once, which keeps it
 * a rhythm rather than a backlog. Nothing here shows another member's
 * progress — BUILD.md §17's "No ranking" is a property of the page, not just
 * of the data.
 */
export default async function ChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const query = await searchParams;
  const challenge = await loadChallenge(slug, session.user.id);
  if (!challenge) notFound();

  const error = challengeErrorText(query.error);
  const finishedNow = query.done === "challenge";

  return (
    <AppShell>
      <div className="space-y-5">
        <nav>
          <Link
            href="/challenges"
            className="text-[13px] text-foreground-muted no-underline hover:underline"
          >
            ← All challenges
          </Link>
        </nav>

        <header className="space-y-2">
          {challenge.theme ? (
            <span className="inline-flex rounded-chip bg-brand-wash px-2 py-0.5 text-[11px] font-bold text-on-brand-wash">
              {challenge.theme}
            </span>
          ) : null}
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {challenge.title}
          </h1>
          {challenge.description ? (
            <p className="max-w-[60ch] text-[14.5px] leading-snug text-foreground-muted">
              {challenge.description}
            </p>
          ) : null}
          <p className="text-[13px] tabular-nums text-foreground-muted">
            {challenge.startsAt.toLocaleDateString()} – {challenge.endsAt.toLocaleDateString()} ·{" "}
            {challenge.targetCount} of {challenge.promptCount} prompts finishes it ·{" "}
            {challenge.participants} joined
          </p>
          {challenge.target ? (
            <p className="text-[13.5px] text-foreground">
              <strong className="font-bold">The goal:</strong> {challenge.target}
            </p>
          ) : null}
        </header>

        {finishedNow ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-card border border-brand/30 bg-brand-wash px-4 py-3 text-[14px] text-on-brand-wash"
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            That is the challenge finished. Your badge is on your profile.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-card border border-danger/30 bg-danger/8 px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        ) : null}

        {challenge.joined ? (
          <div className="space-y-3 rounded-card border border-border bg-surface p-4">
            <Progress card={challenge} />
            {challenge.status !== "finished" ? (
              <form action={leaveAction}>
                <input type="hidden" name="slug" value={challenge.slug} />
                <button
                  type="submit"
                  className="text-[12.5px] text-foreground-muted underline-offset-2 hover:underline"
                >
                  Leave the challenge
                </button>
              </form>
            ) : null}
          </div>
        ) : challenge.status === "finished" ? (
          <p className="rounded-card border border-border bg-surface px-4 py-3 text-[14px] text-foreground-muted">
            This challenge has finished.
          </p>
        ) : (
          <form action={joinAction}>
            <input type="hidden" name="slug" value={challenge.slug} />
            <button type="submit" className="vu-btn vu-btn-primary inline-flex h-11 items-center px-5 text-[14.5px]">
              {challenge.status === "upcoming" ? "Join — starts soon" : "Join the challenge"}
            </button>
          </form>
        )}

        <section className="space-y-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-foreground-muted">
            Prompts
          </h2>
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {challenge.prompts.map((prompt) => {
              const done = prompt.doneAt !== null;
              return (
                <li key={prompt.id} className="border-b border-border p-4 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums ${
                        done
                          ? "bg-brand-fill text-brand-fill-foreground"
                          : prompt.available
                            ? "bg-default text-foreground"
                            : "bg-default text-foreground-muted"
                      }`}
                      aria-hidden
                    >
                      {done ? <Check className="size-3.5" /> : prompt.available ? prompt.day : <Lock className="size-3" />}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h3 className="text-[14.5px] font-bold text-foreground">
                        Day {prompt.day}: {prompt.title}
                      </h3>
                      {prompt.available ? (
                        <p className="text-[13.5px] leading-snug text-foreground-muted">{prompt.body}</p>
                      ) : (
                        <p className="text-[13px] italic text-foreground-muted">
                          Opens on day {prompt.day}.
                        </p>
                      )}

                      {challenge.joined && prompt.available && challenge.status === "open" ? (
                        <form action={done ? unmarkDoneAction : markDoneAction} className="pt-1">
                          <input type="hidden" name="slug" value={challenge.slug} />
                          <input type="hidden" name="promptId" value={prompt.id} />
                          <button
                            type="submit"
                            className={`vu-btn ${done ? "vu-btn-secondary" : "vu-btn-primary"} inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px]`}
                          >
                            {done ? (
                              <>
                                <Undo2 className="size-3.5" aria-hidden />
                                Undo
                              </>
                            ) : (
                              <>
                                <Check className="size-3.5" aria-hidden />
                                Mark done
                              </>
                            )}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
