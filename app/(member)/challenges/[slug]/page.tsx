import { notFound, redirect } from "next/navigation";
import { CalendarDays, Check, Sparkles, Undo2 } from "lucide-react";
import { auth } from "@/auth";
import { challengeErrorText, loadChallenge } from "@/lib/challenges";
import { AppShell } from "@/components/app/app-shell";
import {
  Button,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  Section,
} from "@/components/app/ui";
import { StepMark } from "@/components/learn/step-mark";
import {
  joinAction,
  leaveAction,
  markDoneAction,
  unmarkDoneAction,
} from "@/app/(member)/challenges/actions";
import { ChallengeProgress } from "@/app/(member)/challenges/challenge-progress";

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
      <div className="flex flex-col gap-8">
        <PageHeader
          back={{ href: "/challenges", label: "All challenges" }}
          eyebrow={challenge.theme || undefined}
          title={challenge.title}
          description={challenge.description || undefined}
        >
          <div className="flex flex-col gap-2">
            <p className="text-label tabular-nums text-foreground-muted">
              {challenge.startsAt.toLocaleDateString()} –{" "}
              {challenge.endsAt.toLocaleDateString()} · {challenge.targetCount}{" "}
              of {challenge.promptCount} prompts finishes it ·{" "}
              {challenge.participants} joined
            </p>
            {challenge.target ? (
              <p className="text-body text-foreground">
                <strong className="font-semibold">The goal:</strong>{" "}
                {challenge.target}
              </p>
            ) : null}
          </div>
        </PageHeader>

        {finishedNow || error ? (
          <div className="-mt-2 flex flex-col gap-3">
            {finishedNow ? (
              <Callout tone="success" icon={<Sparkles />} role="status">
                That is the challenge finished. Your badge is on your profile.
              </Callout>
            ) : null}

            {error ? (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            ) : null}
          </div>
        ) : null}

        {challenge.joined ? (
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <ChallengeProgress card={challenge} size="md" />
            </div>
            {challenge.status !== "finished" ? (
              <form action={leaveAction} className="shrink-0">
                <input type="hidden" name="slug" value={challenge.slug} />
                <Button type="submit" variant="danger" size="sm">
                  Leave the challenge
                </Button>
              </form>
            ) : null}
          </Card>
        ) : challenge.status === "finished" ? (
          <Callout tone="neutral">This challenge has finished.</Callout>
        ) : (
          <form action={joinAction}>
            <input type="hidden" name="slug" value={challenge.slug} />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
            >
              {challenge.status === "upcoming"
                ? "Join — starts soon"
                : "Join the challenge"}
            </Button>
          </form>
        )}

        <Section title="Prompts" count={challenge.prompts.length}>
          {challenge.prompts.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<CalendarDays />}
              title="No prompts yet"
              description="The days of this challenge are still being written. Each one appears here as it is added."
            />
          ) : (
            <Card as="div" padding="none" className="overflow-hidden">
              <ul className="divide-y divide-separator">
                {challenge.prompts.map((prompt) => {
                  const done = prompt.doneAt !== null;
                  return (
                    <li
                      key={prompt.id}
                      className="flex items-start gap-3 px-4 py-4 sm:px-5"
                    >
                      <StepMark
                        state={
                          done ? "done" : prompt.available ? "open" : "locked"
                        }
                        className="mt-0.5"
                      >
                        {prompt.day}
                      </StepMark>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <h3
                          className={
                            prompt.available
                              ? "text-body font-semibold text-foreground"
                              : "text-body font-semibold text-foreground-muted"
                          }
                        >
                          Day {prompt.day}: {prompt.title}
                        </h3>
                        {prompt.available ? (
                          <p className="text-body text-foreground-muted">
                            {prompt.body}
                          </p>
                        ) : (
                          <p className="text-label italic text-foreground-muted">
                            Opens on day {prompt.day}.
                          </p>
                        )}

                        {challenge.joined &&
                        prompt.available &&
                        challenge.status === "open" ? (
                          <form
                            action={done ? unmarkDoneAction : markDoneAction}
                            className="pt-1.5"
                          >
                            <input
                              type="hidden"
                              name="slug"
                              value={challenge.slug}
                            />
                            <input
                              type="hidden"
                              name="promptId"
                              value={prompt.id}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant={done ? "secondary" : "primary"}
                            >
                              {done ? (
                                <>
                                  <Undo2 className="size-4" aria-hidden />
                                  Undo
                                </>
                              ) : (
                                <>
                                  <Check className="size-4" aria-hidden />
                                  Mark done
                                </>
                              )}
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
