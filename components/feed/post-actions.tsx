"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import {
  Bookmark,
  MessageSquare,
  Send,
  ThumbsUp,
} from "lucide-react";
import { reactAction, saveAction } from "@/app/(member)/community-actions";
import { runAction } from "@/components/feed/run-action";
import {
  DEFAULT_REACTION,
  FEED_REACTIONS,
  reactionFor,
  topReactions,
} from "@/lib/community/reactions";
import { ReactionBadge, ReactionIcon } from "@/components/feed/reaction-icon";
import { formatCount } from "@/lib/community/format-count";
import { menuClass } from "@/components/app/ui";
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
      await runAction(reactAction, data);
    });
  }

  function save() {
    const data = new FormData();
    data.set("postId", postId);
    startTransition(async () => {
      apply({ saved: !state.saved });
      await runAction(saveAction, data);
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

  /* ---------------------------------------------------------------- compact */
  // A slim strip: icon and count, no labels, no summary row. The picker is
  // left to the card — a hover menu has no room on a row this tight, and a
  // second tap on the post opens the full card anyway.
  if (compact) {
    const strip =
      "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-ctl px-2 text-caption font-medium tabular-nums transition hover:bg-surface-muted";
    return (
      <div className="-ml-2 mt-1.5 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => react(mine ? mine.emoji : DEFAULT_REACTION)}
          aria-pressed={Boolean(mine)}
          aria-label={`${mine ? mine.label : "Like"}${total > 0 ? `, ${formatCount(total)}` : ""}`}
          className={cn(strip, mine ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground")}
        >
          {mine ? (
            <ReactionIcon name={mine.icon} className="size-4" filled />
          ) : (
            <ThumbsUp className="size-4" aria-hidden />
          )}
          {total > 0 ? formatCount(total) : null}
        </button>
        <button
          type="button"
          onClick={onToggleComments}
          aria-pressed={commentsOpen}
          aria-label={`Comments${commentCount > 0 ? `, ${formatCount(commentCount)}` : ""}`}
          className={cn(strip, commentsOpen ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground")}
        >
          <MessageSquare className="size-4" aria-hidden />
          {commentCount > 0 ? formatCount(commentCount) : null}
        </button>
        <button
          type="button"
          onClick={save}
          aria-pressed={state.saved}
          aria-label={state.saved ? "Remove from saved" : "Save"}
          className={cn(strip, state.saved ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground")}
        >
          <Bookmark className="size-4" fill={state.saved ? "currentColor" : "none"} aria-hidden />
        </button>
        <button
          type="button"
          onClick={share}
          aria-label={copied ? "Link copied" : "Send"}
          className={cn(strip, "text-foreground-muted hover:text-foreground")}
        >
          <Send className="size-4" aria-hidden />
          {copied ? "Copied" : null}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Metrics: stacked reactions + counts */}
      {(total > 0 || commentCount > 0 || state.saved) && (
        <div className="flex items-center justify-between gap-3 px-2 pb-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {tops.length > 0 ? (
              <div className="flex items-center -space-x-1">
                {tops.map(({ def }) => (
                  <ReactionBadge key={def.emoji} def={def} size="sm" />
                ))}
              </div>
            ) : null}
            {total > 0 ? (
              <span className="text-caption tabular-nums text-foreground-muted">
                {formatCount(total)}
              </span>
            ) : null}
          </div>
          <p className="shrink-0 text-caption text-foreground-muted">
            {commentCount > 0 ? (
              <button
                type="button"
                onClick={onToggleComments}
                className="rounded-chip transition hover:text-foreground hover:underline"
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

      <div className="grid grid-cols-4 gap-1 border-t border-separator pt-1.5">
        <LikeAction
          mine={mine}
          onLike={() => react(mine ? mine.emoji : DEFAULT_REACTION)}
          onPick={react}
        />
        <ActionButton
          label="Comment"
          active={commentsOpen}
          onClick={onToggleComments}
          icon={<MessageSquare className="size-4.5" aria-hidden />}
        />
        <ActionButton
          label="Saved"
          active={state.saved}
          onClick={save}
          icon={
            <Bookmark
              className="size-4.5"
              fill={state.saved ? "currentColor" : "none"}
              aria-hidden
            />
          }
        />
        <ActionButton
          label={copied ? "Copied" : "Send"}
          onClick={share}
          icon={<Send className="size-4.5" aria-hidden />}
        />
      </div>
    </div>
  );
}

/**
 * One cell of the action bar: a ghost button, icon and label side by side.
 * Four labels do not fit across a 320px card, so on a phone the label is
 * spoken rather than shown and the icon carries the row.
 */
const ACTION =
  "flex h-9 w-full min-w-0 items-center justify-center gap-2 rounded-ctl px-1 text-label font-medium transition hover:bg-surface-muted";

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
        ACTION,
        active
          ? "font-semibold text-brand"
          : "text-foreground-muted hover:text-foreground",
      )}
    >
      {icon}
      <span className="truncate max-sm:sr-only">{label}</span>
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
          ACTION,
          mine
            ? "font-semibold text-brand"
            : "text-foreground-muted hover:text-foreground",
        )}
      >
        {mine ? (
          <ReactionIcon name={mine.icon} className="size-4.5" filled />
        ) : (
          <ThumbsUp className="size-4.5" aria-hidden />
        )}
        <span className="truncate max-sm:sr-only">{mine ? mine.label : "Like"}</span>
      </button>

      {open ? (
        <div
          role="menu"
          onMouseEnter={hold}
          onMouseLeave={close}
          className={cn(
            menuClass,
            "reaction-pop absolute bottom-[calc(100%+0.25rem)] left-0 z-40 flex min-w-0 items-center gap-1 rounded-full px-2 py-1.5",
          )}
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
              className="shrink-0 transition hover:-translate-y-0.5 hover:scale-110"
            >
              <ReactionBadge def={item} size="md" className="ring-overlay" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
