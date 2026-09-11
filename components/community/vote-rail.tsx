"use client";

import { useOptimistic, useTransition } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { voteAction } from "@/app/(member)/community-actions";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/community/format-count";

type State = { score: number; myVote: number };

/**
 * The Reddit vote rail: two arrows with the net score between them, running
 * down the left edge of a post.
 *
 * It writes through a server action but never waits for it. `useOptimistic`
 * moves the score on press and React rolls it back on its own if the write
 * fails — a vote that takes a round trip to appear is the single thing that
 * makes a feed feel broken.
 */
export function VoteRail({
  postId,
  commentId,
  returnToPostId,
  score,
  myVote,
  orientation = "vertical",
}: {
  postId?: string;
  commentId?: string;
  /** Which post page to revalidate when voting on a comment. */
  returnToPostId?: string;
  score: number;
  myVote: number;
  orientation?: "vertical" | "horizontal";
}) {
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic<State, State>(
    { score, myVote },
    (_current, next) => next,
  );

  function vote(value: 1 | -1) {
    // Pressing the arrow you already chose clears the vote, which is what the
    // server's toggle does.
    const next = state.myVote === value ? 0 : value;
    const data = new FormData();
    if (postId) data.set("postId", postId);
    if (commentId) data.set("commentId", commentId);
    if (returnToPostId) data.set("returnToPostId", returnToPostId);
    data.set("value", String(value));
    startTransition(async () => {
      apply({ score: state.score - state.myVote + next, myVote: next });
      await voteAction(data);
    });
  }

  const vertical = orientation === "vertical";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        vertical ? "w-10 flex-col gap-0.5 pt-0.5" : "gap-0.5",
      )}
    >
      <Arrow
        dir="up"
        active={state.myVote === 1}
        onClick={() => vote(1)}
        label="Upvote"
        compact={!vertical}
      />
      <span
        className={cn(
          "select-none text-center text-[13px] font-bold tabular-nums leading-none transition-colors",
          vertical ? "py-0.5" : "min-w-7",
          state.myVote === 1
            ? "text-brand"
            : state.myVote === -1
              ? "text-terracotta"
              : "text-foreground",
        )}
        aria-live="polite"
      >
        {formatCount(state.score)}
      </span>
      <Arrow
        dir="down"
        active={state.myVote === -1}
        onClick={() => vote(-1)}
        label="Downvote"
        compact={!vertical}
      />
    </div>
  );
}

function Arrow({
  dir,
  active,
  onClick,
  label,
  compact,
}: {
  dir: "up" | "down";
  active: boolean;
  onClick: () => void;
  label: string;
  compact?: boolean;
}) {
  const Icon = dir === "up" ? ArrowBigUp : ArrowBigDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid place-items-center rounded-chip transition",
        compact ? "size-6" : "size-7",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "active:scale-90",
        active
          ? dir === "up"
            ? "text-brand"
            : "text-terracotta"
          : dir === "up"
            ? "text-foreground-muted hover:bg-brand-wash hover:text-brand"
            : "text-foreground-muted hover:bg-terracotta/10 hover:text-terracotta",
      )}
    >
      <Icon
        className={compact ? "size-[1.1rem]" : "size-[1.35rem]"}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}
