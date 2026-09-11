"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Bookmark, Heart, MessageSquare, Share2 } from "lucide-react";
import { reactAction, saveAction } from "@/app/(member)/community-actions";
import { FEED_REACTIONS, reactionFor } from "@/lib/community/reactions";
import { ReactionIcon } from "@/components/feed/reaction-icon";
import { formatCount } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

/** The stored value behind the plain Like button. */
const LIKE = "❤️";

type State = {
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
};

/**
 * The action row under a post.
 *
 * Reddit's shape: small, low-contrast pills that read as metadata rather than
 * as buttons, grouped tight to the left instead of spread across the card. The
 * count sits inside the control, so the row does not change width when a number
 * grows.
 *
 * Like maps to a single stored reaction, so the count is one number. The rest of
 * the reaction set is reachable by hovering, which keeps the rows already in the
 * database meaningful instead of flattening them all into hearts.
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
      // Clipboard can be refused; the link is still in the address bar.
    }
  }

  const mine = reactionFor(state.myReaction);
  const likes = Object.values(state.counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className={cn("flex items-center gap-0.5", compact ? "mt-1.5" : "mt-2")}>
      <Pill
        icon={<MessageSquare className="size-4" aria-hidden />}
        label={commentCount > 0 ? formatCount(commentCount) : "Reply"}
        srLabel={commentsOpen ? "Hide replies" : `${commentCount} replies`}
        active={commentsOpen}
        onClick={onToggleComments}
      />

      <LikePill
        mine={mine}
        count={likes}
        onLike={() => react(mine ? mine.emoji : LIKE)}
        onPick={react}
      />

      <Pill
        icon={<Share2 className="size-4" aria-hidden />}
        label={copied ? "Copied" : "Share"}
        onClick={share}
      />

      <Pill
        icon={
          <Bookmark
            className="size-4"
            fill={state.saved ? "currentColor" : "none"}
            aria-hidden
          />
        }
        label={state.saved ? "Saved" : "Save"}
        active={state.saved}
        onClick={save}
      />
    </div>
  );
}

function Pill({
  icon,
  label,
  srLabel,
  active,
  onClick,
  tone = "brand",
}: {
  icon: React.ReactNode;
  label: string;
  srLabel?: string;
  active?: boolean;
  onClick?: () => void;
  tone?: "brand" | "warm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={srLabel}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-chip px-2 text-[12.5px] font-bold transition",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        active
          ? tone === "warm"
            ? "bg-terracotta/10 text-terracotta"
            : "bg-brand-wash text-brand"
          : tone === "warm"
            ? "text-foreground-muted hover:bg-terracotta/10 hover:text-terracotta"
            : "text-foreground-muted hover:bg-mint hover:text-foreground",
      )}
    >
      {icon}
      <span className="tabular-nums">{label}</span>
    </button>
  );
}

function LikePill({
  mine,
  count,
  onLike,
  onPick,
}: {
  mine: ReturnType<typeof reactionFor>;
  count: number;
  onLike: () => void;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  function close() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 220);
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
      <Pill
        tone="warm"
        active={Boolean(mine)}
        onClick={onLike}
        srLabel={mine ? mine.label : "Like"}
        icon={
          mine ? (
            <ReactionIcon name={mine.icon} className="size-4" filled />
          ) : (
            <Heart className="size-4" aria-hidden />
          )
        }
        label={count > 0 ? formatCount(count) : "Like"}
      />

      {open ? (
        <div
          onFocus={hold}
          onBlur={close}
          className="absolute bottom-[calc(100%+0.25rem)] left-0 z-30 flex origin-bottom-left animate-[reaction-pop_140ms_ease-out] items-center gap-0.5 rounded-full border border-border bg-overlay p-1 shadow-e2"
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
                "grid size-8 place-items-center rounded-full transition hover:-translate-y-0.5 hover:bg-mint",
                mine?.emoji === item.emoji && "bg-brand-wash text-brand",
              )}
            >
              <ReactionIcon
                name={item.icon}
                className="size-4"
                filled={mine?.emoji === item.emoji}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
