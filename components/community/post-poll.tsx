"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { votePollAction } from "@/app/(member)/community-actions";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; _count: { votes: number } };

/**
 * Poll options with result bars.
 *
 * The old version rendered plain bordered buttons with a bare vote number, so a
 * poll gave no sense of the split. Each row now fills to its share, and the
 * chosen option moves immediately rather than after a feed re-render.
 */
export function PostPoll({ options }: { options: Option[] }) {
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic(
    { counts: Object.fromEntries(options.map((o) => [o.id, o._count.votes])), mine: null as string | null },
    (
      current,
      next: { id: string },
    ) => {
      const counts = { ...current.counts };
      if (current.mine) counts[current.mine] = Math.max(0, (counts[current.mine] ?? 1) - 1);
      if (current.mine === next.id) return { counts, mine: null };
      counts[next.id] = (counts[next.id] ?? 0) + 1;
      return { counts, mine: next.id };
    },
  );

  const total = Object.values(state.counts).reduce((sum, value) => sum + value, 0);

  function pick(id: string) {
    const data = new FormData();
    data.set("optionId", id);
    startTransition(async () => {
      apply({ id });
      await votePollAction(data);
    });
  }

  return (
    <div className="mt-4 space-y-2">
      {options.map((option) => {
        const votes = state.counts[option.id] ?? 0;
        const share = total > 0 ? Math.round((votes / total) * 100) : 0;
        const chosen = state.mine === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => pick(option.id)}
            aria-pressed={chosen}
            className={cn(
              "relative flex min-h-11 w-full items-center justify-between overflow-hidden rounded-[0.9rem] border px-4 text-left text-sm font-medium transition",
              chosen
                ? "border-accent text-forest"
                : "border-sand text-foreground hover:border-accent/60",
            )}
          >
            {/* Result fill sits behind the label. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0 left-0 transition-[width] duration-500 ease-out",
                chosen ? "bg-accent/18" : "bg-mint",
              )}
              style={{ width: `${share}%` }}
            />
            <span className="relative flex items-center gap-2">
              {chosen ? <Check className="size-4 text-accent" aria-hidden /> : null}
              {option.label}
            </span>
            <span className="relative text-xs font-bold tabular-nums text-foreground-muted">
              {share}%
            </span>
          </button>
        );
      })}
      <p className="pt-0.5 text-xs text-foreground-muted">
        {total} {total === 1 ? "vote" : "votes"}
      </p>
    </div>
  );
}
