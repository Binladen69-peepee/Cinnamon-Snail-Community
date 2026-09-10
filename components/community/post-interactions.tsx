"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  ArrowBigDown,
  ArrowBigUp,
  Bookmark,
  BookmarkCheck,
  MessageCircle,
} from "lucide-react";
import {
  reactAction,
  saveAction,
  voteAction,
} from "@/app/(member)/community-actions";
import { FEED_REACTIONS, reactionFor, topReactions } from "@/lib/community/reactions";
import { ReactionIcon } from "@/components/community/reaction-icon";
import { ShareButton } from "@/components/community/share-button";
import { cn } from "@/lib/utils";

type State = {
  score: number;
  myVote: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
};

/**
 * The post action bar.
 *
 * Every control here writes through a server action, but the UI does not wait
 * for the round trip: `useOptimistic` moves the score, the reaction and the
 * bookmark the instant they are pressed, and React reverts them on its own if
 * the action fails. Before this, each of these was a plain form post, so a vote
 * left no trace until the whole feed had re-rendered — which is what made the
 * feed feel uncertain.
 */
export function PostInteractions({
  postId,
  commentCount,
  score,
  myVote,
  myReaction,
  counts,
  saved,
  onToggleComments,
  commentsOpen,
}: {
  postId: string;
  commentCount: number;
  score: number;
  myVote: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
  onToggleComments?: () => void;
  commentsOpen?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic<State, Partial<State>>(
    { score, myVote, myReaction, counts, saved },
    (current, patch) => ({ ...current, ...patch }),
  );

  function vote(value: 1 | -1) {
    // Pressing the active arrow clears the vote, matching the server's toggle.
    const next = state.myVote === value ? 0 : value;
    const data = new FormData();
    data.set("postId", postId);
    data.set("value", String(value));
    startTransition(async () => {
      apply({ score: state.score - state.myVote + next, myVote: next });
      await voteAction(data);
    });
  }

  function react(emoji: string) {
    const clearing = state.myReaction === emoji;
    const counts = { ...state.counts };
    if (state.myReaction) {
      counts[state.myReaction] = Math.max(0, (counts[state.myReaction] ?? 1) - 1);
    }
    if (!clearing) counts[emoji] = (counts[emoji] ?? 0) + 1;

    const data = new FormData();
    data.set("postId", postId);
    data.set("emoji", emoji);
    startTransition(async () => {
      apply({ myReaction: clearing ? null : emoji, counts });
      await reactAction(data);
    });
  }

  function save() {
    const data = new FormData();
    data.set("postId", postId);
    startTransition(async () => {
      apply({ saved: !state.saved });
      await saveAction(data);
    });
  }

  const mine = reactionFor(state.myReaction);
  const summary = topReactions(state.counts);
  const total = Object.values(state.counts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="mt-4 border-t border-sand/70 pt-3">
      {/* Reaction summary reads before the controls, the way it does on any
          mature feed: what others did, then what you can do. */}
      {total > 0 ? (
        <div className="mb-3 flex items-center gap-2">
          <span className="flex -space-x-1.5">
            {summary.map(({ def }) => (
              <span
                key={def.emoji}
                title={def.label}
                className="grid size-6 place-items-center rounded-full bg-sage ring-2 ring-surface"
              >
                <ReactionIcon name={def.icon} className="size-3 text-forest" filled />
              </span>
            ))}
          </span>
          <span className="text-xs font-medium text-foreground-muted">
            {total} {total === 1 ? "reaction" : "reactions"}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Votes */}
        <div className="inline-flex items-center rounded-full bg-mint/70 p-0.5">
          <button
            type="button"
            onClick={() => vote(1)}
            aria-label="Upvote"
            aria-pressed={state.myVote === 1}
            className={cn(
              "grid size-9 place-items-center rounded-full transition active:scale-90",
              state.myVote === 1
                ? "text-accent"
                : "text-foreground-muted hover:bg-surface hover:text-accent",
            )}
          >
            <ArrowBigUp
              className="size-[1.15rem]"
              fill={state.myVote === 1 ? "currentColor" : "none"}
            />
          </button>
          <span
            className={cn(
              "min-w-6 text-center text-[13px] font-bold tabular-nums transition-colors",
              state.myVote === 1
                ? "text-accent"
                : state.myVote === -1
                  ? "text-foreground-muted"
                  : "text-foreground",
            )}
          >
            {state.score}
          </span>
          <button
            type="button"
            onClick={() => vote(-1)}
            aria-label="Downvote"
            aria-pressed={state.myVote === -1}
            className={cn(
              "grid size-9 place-items-center rounded-full transition active:scale-90",
              state.myVote === -1
                ? "text-foreground"
                : "text-foreground-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <ArrowBigDown
              className="size-[1.15rem]"
              fill={state.myVote === -1 ? "currentColor" : "none"}
            />
          </button>
        </div>

        <ReactionPicker current={mine} onPick={react} />

        <ActionButton
          onClick={onToggleComments}
          active={commentsOpen}
          icon={<MessageCircle className="size-4" aria-hidden />}
          label={commentCount > 0 ? String(commentCount) : "Comment"}
          srLabel={`${commentCount} comments`}
        />

        <ShareButton path={`/posts/${postId}`} />

        <ActionButton
          onClick={save}
          active={state.saved}
          icon={
            state.saved ? (
              <BookmarkCheck className="size-4" aria-hidden />
            ) : (
              <Bookmark className="size-4" aria-hidden />
            )
          }
          label={state.saved ? "Saved" : "Save"}
        />
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  srLabel,
  active,
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  srLabel?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={srLabel}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition active:scale-95",
        active
          ? "bg-sage text-forest"
          : "text-foreground-muted hover:bg-mint hover:text-forest",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ReactionPicker({
  current,
  onPick,
}: {
  current: ReturnType<typeof reactionFor>;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 220);
  }
  function cancelClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => (current ? onPick(current.emoji) : onPick(FEED_REACTIONS[0].emoji))}
        aria-pressed={Boolean(current)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition active:scale-95",
          current
            ? "bg-sage text-forest"
            : "text-foreground-muted hover:bg-mint hover:text-forest",
        )}
      >
        {current ? (
          <ReactionIcon name={current.icon} filled />
        ) : (
          <ReactionIcon name="heart" />
        )}
        {current ? current.label : "React"}
      </button>

      {open ? (
        <div
          onFocus={cancelClose}
          onBlur={scheduleClose}
          className="absolute bottom-[calc(100%+0.4rem)] left-0 z-20 flex origin-bottom-left animate-[reaction-pop_140ms_ease-out] items-center gap-0.5 rounded-full border border-sand bg-surface p-1 shadow-[0_12px_30px_rgba(15,61,50,0.16)]"
        >
          {FEED_REACTIONS.map((item) => (
            <button
              key={item.emoji}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                onPick(item.emoji);
                setOpen(false);
              }}
              className={cn(
                "grid size-9 place-items-center rounded-full transition hover:-translate-y-0.5 hover:bg-mint",
                current?.emoji === item.emoji && "bg-sage text-forest",
              )}
            >
              <ReactionIcon
                name={item.icon}
                className="size-[1.1rem]"
                filled={current?.emoji === item.emoji}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
