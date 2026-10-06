"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { votePollAction } from "@/app/(member)/community-actions";
import { runAction } from "@/components/feed/run-action";
import { formatCount } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; _count: { votes: number } };

type Tally = { mine: string | null; counts: Record<string, number> };

function tallyOf(options: Option[], mine: string | null): Tally {
  return {
    mine,
    counts: Object.fromEntries(options.map((option) => [option.id, option._count.votes])),
  };
}

/**
 * A poll on a post.
 *
 * Polls could be written but never answered: the card drew the question and
 * not the options. One vote per member per poll, enforced by `votePoll`;
 * choosing the same option again takes the vote back, as the server does.
 * Results show once the reader has voted, so the first answers do not steer
 * everyone after them.
 */
export function PostPoll({
  postId,
  options,
  myOptionId,
}: {
  postId: string;
  options: Option[];
  myOptionId: string | null;
}) {
  const [tally, setTally] = useState<Tally>(() => tallyOf(options, myOptionId));
  // New data from the server (a refresh) replaces what this card counted.
  const [source, setSource] = useState({ options, myOptionId });
  if (source.options !== options || source.myOptionId !== myOptionId) {
    setSource({ options, myOptionId });
    setTally(tallyOf(options, myOptionId));
  }
  const [pending, startTransition] = useTransition();

  if (options.length === 0) return null;

  const total = Object.values(tally.counts).reduce((sum, n) => sum + n, 0);
  const voted = tally.mine !== null;

  function vote(optionId: string) {
    const before = tally;
    const next = tally.mine === optionId ? null : optionId;
    const counts = { ...tally.counts };
    if (tally.mine) counts[tally.mine] = Math.max(0, (counts[tally.mine] ?? 1) - 1);
    if (next) counts[next] = (counts[next] ?? 0) + 1;
    setTally({ mine: next, counts });

    const data = new FormData();
    data.set("postId", postId);
    data.set("optionId", optionId);
    startTransition(async () => {
      const ok = await runAction(votePollAction, data);
      if (!ok) setTally(before);
    });
  }

  return (
    <div className="mt-3" role="group" aria-label="Poll">
      <ul className="flex flex-col gap-1.5">
        {options.map((option) => {
          const count = tally.counts[option.id] ?? 0;
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          const chosen = tally.mine === option.id;
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => vote(option.id)}
                disabled={pending}
                aria-pressed={chosen}
                aria-label={
                  voted
                    ? `${option.label}, ${percent}%${chosen ? ", your vote" : ""}`
                    : option.label
                }
                className={cn(
                  "relative flex min-h-10 w-full items-center gap-2 overflow-hidden rounded-ctl border px-3 py-2 text-left text-body transition disabled:cursor-wait",
                  chosen
                    ? "border-brand text-foreground"
                    : "border-border text-foreground hover:border-hairline-firm hover:bg-surface-muted",
                )}
              >
                {voted ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 transition-[width] duration-500",
                      chosen ? "bg-brand-wash" : "bg-surface-muted",
                    )}
                    style={{ width: `${percent}%` }}
                  />
                ) : null}
                <span className="relative min-w-0 flex-1 font-medium">{option.label}</span>
                {chosen ? (
                  <Check className="relative size-4 shrink-0 text-brand" aria-hidden />
                ) : null}
                {voted ? (
                  <span className="relative shrink-0 text-caption font-semibold tabular-nums text-foreground-muted">
                    {percent}%
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-caption text-foreground-muted">
        {formatCount(total)} {total === 1 ? "vote" : "votes"}
        {voted ? " · Tap your choice again to take it back." : ""}
      </p>
    </div>
  );
}
