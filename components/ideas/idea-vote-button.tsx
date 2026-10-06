"use client";

import { useOptimistic, useTransition } from "react";
import { ArrowBigUp, Lock } from "lucide-react";
import { toggleIdeaVoteAction } from "@/app/(member)/ideas/actions";
import { toast } from "@/components/ui/toast";
import { formatCount } from "@/lib/community/format-count";
import { VOTE_BLOCK_MESSAGES, type VoteBlock } from "@/lib/ideas/rules";
import { cn } from "@/lib/utils";

type State = { voted: boolean; score: number };

const SIZE = {
  /** Down the left edge of a row on the board. */
  md: "w-12 flex-col gap-0.5 py-1.5",
  /** Beside the title on an idea's own page. */
  lg: "w-16 flex-col gap-0.5 py-2.5",
  /** Inline, in the "already on the board" list. */
  sm: "h-8 flex-row gap-1 px-2.5",
} as const;

/**
 * The upvote, Reddit-style: an arrow and the count, one vote per member.
 *
 * Optimistic like the feed's vote rail: the arrow fills and the count moves on
 * press, and React rolls it back if the server refuses, with the reason said
 * out loud. The page is revalidated by the action, so the settled number is
 * always the server's.
 *
 * When the member cannot vote (their own idea, voting closed, merged) it is not
 * a button at all, and says why to a screen reader and on hover.
 */
export function IdeaVoteButton({
  ideaId,
  title,
  score,
  voted,
  block,
  size = "md",
  onSettled,
  className,
}: {
  ideaId: string;
  title: string;
  score: number;
  voted: boolean;
  block: VoteBlock | null;
  size?: keyof typeof SIZE;
  /** For lists that are not re-rendered by the page (the form's look-up). */
  onSettled?: (state: State) => void;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, apply] = useOptimistic<State, State>({ voted, score }, (_current, next) => next);

  const count = (
    <span className="flex flex-col items-center gap-0.5" aria-hidden>
      <span
        className={cn(
          "font-semibold tabular-nums leading-none",
          size === "lg" ? "text-title" : "text-label",
        )}
      >
        {formatCount(state.score)}
      </span>
      {size === "lg" ? (
        <span className="text-micro font-medium leading-none">
          {state.score === 1 ? "vote" : "votes"}
        </span>
      ) : null}
    </span>
  );
  const votesLabel = `${state.score} ${state.score === 1 ? "vote" : "votes"}`;

  if (block) {
    // The author's own idea reads as voted: their vote is in the count.
    const own = block === "own";
    return (
      <span
        title={VOTE_BLOCK_MESSAGES[block]}
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center rounded-ctl border",
          SIZE[size],
          own
            ? "border-transparent bg-brand-wash text-on-brand-wash"
            : "border-border bg-surface-muted text-foreground-muted",
          className,
        )}
      >
        {own ? (
          <ArrowBigUp className="size-5" fill="currentColor" aria-hidden />
        ) : (
          <Lock className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
        )}
        {count}
        <span className="sr-only">
          {votesLabel}. {VOTE_BLOCK_MESSAGES[block]}
        </span>
      </span>
    );
  }

  function toggle() {
    const next: State = {
      voted: !state.voted,
      score: state.score + (state.voted ? -1 : 1),
    };
    const data = new FormData();
    data.set("ideaId", ideaId);
    startTransition(async () => {
      apply(next);
      let result: Awaited<ReturnType<typeof toggleIdeaVoteAction>>;
      try {
        result = await toggleIdeaVoteAction(data);
      } catch {
        toast.danger("Your vote did not go through. Check your connection and try again.");
        return;
      }
      if (!result.ok) {
        toast.danger(result.error);
        return;
      }
      onSettled?.({ voted: result.voted, score: result.score });
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.voted}
      aria-label={
        state.voted
          ? `Remove your upvote from “${title}”. ${votesLabel}.`
          : `Upvote “${title}”. ${votesLabel}.`
      }
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-ctl border transition active:scale-95",
        SIZE[size],
        state.voted
          ? "border-transparent bg-brand-wash text-on-brand-wash hover:bg-brand-wash"
          : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:bg-surface-muted hover:text-brand-strong",
        className,
      )}
    >
      <ArrowBigUp
        className={size === "sm" ? "size-4" : "size-5"}
        fill={state.voted ? "currentColor" : "none"}
        aria-hidden
      />
      {count}
    </button>
  );
}
