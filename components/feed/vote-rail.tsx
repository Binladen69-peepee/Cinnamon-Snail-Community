"use client";

import { useOptimistic, useTransition } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { voteAction } from "@/app/(member)/community-actions";
import { formatCount } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

type State = { score: number; myVote: number };

/**
 * The vote rail: two arrows with the net score between them.
 *
 * Old-Reddit's placement, down the left edge of a post, rather than new
 * Reddit's action-row pill. Kept deliberately — it is the arrangement that
 * makes a post's standing readable before you have read the post.
 *
 * It writes through a server action but never waits for it: `useOptimistic`
 * moves the score on press and React rolls it back if the write fails. A vote
 * that takes a round trip to appear is the single thing that makes a feed feel
 * broken.
 */
export function VoteRail({
  postId,
  commentId,
  returnToPostId,
  score,
  myVote,
  layout = "column",
}: {
  postId?: string;
  commentId?: string;
  returnToPostId?: string;
  score: number;
  myVote: number;
  layout?: "column" | "row";
}) {
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic<State, State>(
    { score, myVote },
    (_current, next) => next,
  );

  function vote(value: 1 | -1) {
    // Pressing the arrow you already chose clears the vote, matching the
    // server's toggle.
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

  const column = layout === "column";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        column ? "w-9 flex-col gap-px pt-0.5" : "gap-px",
      )}
    >
      <Arrow dir="up" active={state.myVote === 1} onClick={() => vote(1)} />
      <span
        className={cn(
          "select-none text-center text-[12.5px] font-bold leading-none tabular-nums",
          column ? "py-0.5" : "min-w-6",
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
      <Arrow dir="down" active={state.myVote === -1} onClick={() => vote(-1)} />
    </div>
  );
}

function Arrow({
  dir,
  active,
  onClick,
}: {
  dir: "up" | "down";
  active: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "up" ? ArrowBigUp : ArrowBigDown;
  const label = dir === "up" ? "Upvote" : "Downvote";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-6 place-items-center rounded-chip transition active:scale-90",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        active
          ? dir === "up"
            ? "text-brand"
            : "text-terracotta"
          : dir === "up"
            ? "text-foreground-muted hover:bg-brand-wash hover:text-brand"
            : "text-foreground-muted hover:bg-terracotta/10 hover:text-terracotta",
      )}
    >
      <Icon className="size-[1.2rem]" fill={active ? "currentColor" : "none"} />
    </button>
  );
}
