"use client";

import { useRef, useState } from "react";
import { MessageSquare, Pin, ThumbsUp } from "lucide-react";
import {
  DEFAULT_REACTION,
  FEED_REACTIONS,
  reactionFor,
  topReactions,
} from "@/lib/community/reactions";
import { ReactionBadge, ReactionIcon } from "@/components/feed/reaction-icon";
import { usePin, useReaction } from "@/components/feed/use-engagement";
import { formatCount } from "@/lib/community/format-count";
import { menuClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * Engagement under a post: the reaction summary, then three actions —
 * Like · Comment · Pin.
 *
 * "Pin this post" replaced the old save button (DEC-078): the same row, so
 * every earlier save is a pin, and a pinned post leads the member's own
 * Kitchen Table.
 * Sharing is gone. The reader's pin and reaction come from the shared
 * engagement store, so the card, its lightbox and its reel always agree, and a
 * press survives the feed re-rendering underneath it.
 */
export function PostActions({
  postId,
  commentCount,
  myReaction,
  counts,
  pinned: initialPinned,
  commentsOpen,
  onToggleComments,
  compact = false,
}: {
  postId: string;
  commentCount: number;
  myReaction: string | null;
  counts: Record<string, number>;
  /** Whether the reader had pinned it when the post was loaded. */
  pinned: boolean;
  commentsOpen?: boolean;
  onToggleComments?: () => void;
  compact?: boolean;
}) {
  const reaction = useReaction(postId, myReaction, counts);
  const pin = usePin(postId, initialPinned);

  const mine = reactionFor(reaction.mine);
  const tops = topReactions(reaction.counts, 3);
  const pinLabel = pin.pinned ? "Unpin this post" : "Pin this post";

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
          onClick={() => reaction.setReaction(mine ? null : DEFAULT_REACTION)}
          aria-pressed={Boolean(mine)}
          aria-label={`${mine ? mine.label : "Like"}${reaction.total > 0 ? `, ${formatCount(reaction.total)}` : ""}`}
          className={cn(
            strip,
            mine ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground",
          )}
        >
          {mine ? (
            <ReactionIcon name={mine.icon} className="size-4" filled />
          ) : (
            <ThumbsUp className="size-4" aria-hidden />
          )}
          {reaction.total > 0 ? formatCount(reaction.total) : null}
        </button>
        <button
          type="button"
          onClick={onToggleComments}
          aria-pressed={commentsOpen}
          aria-label={`Comments${commentCount > 0 ? `, ${formatCount(commentCount)}` : ""}`}
          className={cn(
            strip,
            commentsOpen ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground",
          )}
        >
          <MessageSquare className="size-4" aria-hidden />
          {commentCount > 0 ? formatCount(commentCount) : null}
        </button>
        <button
          type="button"
          onClick={pin.toggle}
          aria-label={pinLabel}
          title={pinLabel}
          className={cn(
            strip,
            pin.pinned ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground",
          )}
        >
          <Pin className="size-4" fill={pin.pinned ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Metrics: stacked reactions + counts */}
      {reaction.total > 0 || commentCount > 0 || pin.pinned ? (
        <div className="flex items-center justify-between gap-3 px-2 pb-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {tops.length > 0 ? (
              <div className="flex items-center -space-x-1">
                {tops.map(({ def }) => (
                  <ReactionBadge key={def.emoji} def={def} size="sm" />
                ))}
              </div>
            ) : null}
            {reaction.total > 0 ? (
              <span className="text-caption tabular-nums text-foreground-muted">
                {formatCount(reaction.total)}
              </span>
            ) : null}
          </div>
          <p className="flex shrink-0 items-center gap-1.5 text-caption text-foreground-muted">
            {commentCount > 0 ? (
              <button
                type="button"
                onClick={onToggleComments}
                className="rounded-chip transition hover:text-foreground hover:underline"
              >
                {formatCount(commentCount)} {commentCount === 1 ? "comment" : "comments"}
              </button>
            ) : null}
            {commentCount > 0 && pin.pinned ? <span aria-hidden>·</span> : null}
            {pin.pinned ? (
              <span className="inline-flex items-center gap-1">
                <Pin className="size-3" aria-hidden />
                Pinned
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1 border-t border-separator pt-1.5">
        <LikeAction
          mine={mine}
          onLike={() => reaction.setReaction(mine ? null : DEFAULT_REACTION)}
          onPick={reaction.press}
        />
        <ActionButton
          label="Comment"
          active={commentsOpen}
          onClick={onToggleComments}
          icon={<MessageSquare className="size-4.5" aria-hidden />}
        />
        <ActionButton
          label={pin.pinned ? "Pinned" : "Pin"}
          ariaLabel={pinLabel}
          active={pin.pinned}
          toggle={false}
          onClick={pin.toggle}
          icon={
            <Pin
              className="size-4.5"
              fill={pin.pinned ? "currentColor" : "none"}
              aria-hidden
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * One cell of the action bar: a ghost button, icon and label side by side.
 * Three labels fit across a 320px card only as icons, so on a phone the label
 * is spoken rather than shown and the icon carries the row.
 */
const ACTION =
  "flex h-9 w-full min-w-0 items-center justify-center gap-2 rounded-ctl px-1 text-label font-medium transition hover:bg-surface-muted";

function ActionButton({
  icon,
  label,
  ariaLabel,
  active,
  toggle = true,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  /** Spoken instead of the label, when the label alone would be ambiguous. */
  ariaLabel?: string;
  active?: boolean;
  /** A toggle announces its state; an action whose label changes does not. */
  toggle?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={toggle ? active : undefined}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        ACTION,
        active ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground",
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
          mine ? "font-semibold text-brand" : "text-foreground-muted hover:text-foreground",
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
          aria-label="Reactions"
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
