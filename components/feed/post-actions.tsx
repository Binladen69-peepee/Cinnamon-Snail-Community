"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  Bookmark,
  MessageSquare,
  Send,
  ThumbsUp,
} from "lucide-react";
import { reactAction, saveAction } from "@/app/(member)/community-actions";
import {
  DEFAULT_REACTION,
  FEED_REACTIONS,
  reactionFor,
  topReactions,
} from "@/lib/community/reactions";
import { ReactionBadge, ReactionIcon } from "@/components/feed/reaction-icon";
import { formatCount } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

type State = {
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
};

/**
 * LinkedIn-style engagement: reaction summary row + four equal actions
 * (Like · Comment · Saved · Send). Like opens a coloured reaction picker on hover.
 */
export function PostActions({
  postId,
  commentCount,
  myReaction,
  counts,
  saved,
  commentsOpen,
  onToggleComments,
  compact = false,
}: {
  postId: string;
  commentCount: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
  commentsOpen?: boolean;
  onToggleComments?: () => void;
  compact?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [state, apply] = useOptimistic<State, Partial<State>>(
    { myReaction, counts, saved },
    (current, patch) => ({ ...current, ...patch }),
  );
  const [copied, setCopied] = useState(false);

  function react(emoji: string) {
    const clearing = state.myReaction === emoji;
    const next = { ...state.counts };
    if (state.myReaction) {
      next[state.myReaction] = Math.max(0, (next[state.myReaction] ?? 1) - 1);
    }
    if (!clearing) next[emoji] = (next[emoji] ?? 0) + 1;

    const data = new FormData();
    data.set("postId", postId);
    data.set("emoji", emoji);
    startTransition(async () => {
      apply({ myReaction: clearing ? null : emoji, counts: next });
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

  async function share() {
    const url = new URL(`/posts/${postId}`, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ url, title: "Vegan University" }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be refused.
    }
  }

  const mine = reactionFor(state.myReaction);
  const total = Object.values(state.counts).reduce((sum, n) => sum + n, 0);
  const tops = topReactions(state.counts, 3);

  return (
    <div className={cn(compact ? "mt-1" : "mt-0")}>
      {/* Metrics: stacked reactions + counts */}
      {(total > 0 || commentCount > 0 || state.saved) && (
        <div className="flex items-center justify-between gap-3 px-1 pb-2 pt-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {tops.length > 0 ? (
              <div className="flex items-center -space-x-1">
                {tops.map(({ def }) => (
                  <ReactionBadge key={def.emoji} def={def} size="sm" />
                ))}
              </div>
            ) : null}
            {total > 0 ? (
              <span className="text-[12.5px] tabular-nums text-foreground-muted">
                {formatCount(total)}
              </span>
            ) : null}
          </div>
          <p className="shrink-0 text-[12.5px] text-foreground-muted">
            {commentCount > 0 ? (
              <button
                type="button"
                onClick={onToggleComments}
                className="hover:text-foreground hover:underline"
              >
                {formatCount(commentCount)}{" "}
                {commentCount === 1 ? "comment" : "comments"}
              </button>
            ) : null}
            {commentCount > 0 && state.saved ? (
              <span aria-hidden> · </span>
            ) : null}
            {state.saved ? <span>Saved</span> : null}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 border-t border-border">
        <LikeAction
          mine={mine}
          onLike={() => react(mine ? mine.emoji : DEFAULT_REACTION)}
          onPick={react}
        />
        <ActionButton
          label="Comment"
          active={commentsOpen}
          onClick={onToggleComments}
          icon={<MessageSquare className="size-[1.15rem]" aria-hidden />}
        />
        <ActionButton
                        label="Saved"
          active={state.saved}
          onClick={save}
          icon={
            <Bookmark
              className="size-[1.15rem]"
              fill={state.saved ? "currentColor" : "none"}
              aria-hidden
            />
          }
        />
        <ActionButton
          label={copied ? "Copied" : "Send"}
          onClick={share}
          icon={<Send className="size-[1.15rem]" aria-hidden />}
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-[8px] px-1 py-2.5 text-[12px] transition",
        "hover:bg-mint/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
        active
          ? "font-semibold text-brand"
          : "text-foreground-muted hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function LikeAction({
  mine,
  onLike,
  onPick,
}: {
  mine: ReturnType<typeof reactionFor>;
  onLike: () => void;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  function close() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 280);
  }
  function hold() {
    if (timer.current) window.clearTimeout(timer.current);
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        hold();
        setOpen(true);
      }}
      onMouseLeave={close}
    >
      <button
        type="button"
        onClick={onLike}
        aria-pressed={Boolean(mine)}
        aria-label={mine ? mine.label : "Like"}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-0.5 rounded-[8px] px-1 py-2.5 text-[12px] transition",
          "hover:bg-mint/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
          mine
            ? "font-semibold text-[#378fe9]"
            : "text-foreground-muted hover:text-foreground",
        )}
      >
        {mine ? (
          <ReactionIcon name={mine.icon} className="size-[1.15rem]" filled />
        ) : (
          <ThumbsUp className="size-[1.15rem]" aria-hidden />
        )}
        <span>{mine ? mine.label : "Like"}</span>
      </button>

      {open ? (
        <div
          role="menu"
          onMouseEnter={hold}
          onMouseLeave={close}
          className="absolute bottom-[calc(100%-0.15rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-overlay px-2 py-1.5 shadow-e3 reaction-pop"
        >
          {FEED_REACTIONS.map((item) => (
            <button
              key={item.emoji}
              type="button"
              role="menuitem"
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                onPick(item.emoji);
                setOpen(false);
              }}
              className="transition hover:-translate-y-1 hover:scale-110"
            >
              <ReactionBadge def={item} size="lg" className="ring-overlay" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
