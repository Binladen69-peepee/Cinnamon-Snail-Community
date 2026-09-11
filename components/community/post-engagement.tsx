"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react";
import { reactAction, saveAction } from "@/app/(member)/community-actions";
import { FEED_REACTIONS, reactionFor } from "@/lib/community/reactions";
import { ReactionIcon } from "@/components/community/reaction-icon";
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
 * The engagement row that sits directly under a post: reply, share, like with
 * its count, save.
 *
 * Shaped after Twitter rather than the previous pill bar — a bare icon with the
 * count beside it, and the tint only appearing on hover. Pills read as four
 * competing buttons; this reads as a caption you can press.
 *
 * Like maps to a single stored reaction so the count is one number, which is
 * what the brief asked for. The other reactions are still reachable by hovering
 * the like button, so the rows already in the database keep their meaning
 * instead of being flattened into hearts.
 */
export function PostEngagement({
  postId,
  commentCount,
  myReaction,
  counts,
  saved,
  commentsOpen,
  onToggleComments,
}: {
  postId: string;
  commentCount: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
  commentsOpen?: boolean;
  onToggleComments?: () => void;
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
    /* Capped width: spread across a full-width post page the four icons drift
       so far apart they stop reading as one row. */
    <div className="mt-3 flex max-w-md items-center justify-between gap-1 pr-1">
      <Action
        icon={<MessageCircle className="size-[1.15rem]" aria-hidden />}
        count={commentCount}
        label={commentsOpen ? "Hide replies" : "Reply"}
        tone="brand"
        active={commentsOpen}
        onClick={onToggleComments}
      />

      <Action
        icon={<Share2 className="size-[1.1rem]" aria-hidden />}
        label={copied ? "Link copied" : "Share"}
        tone="brand"
        onClick={share}
      />

      {/* Like, with the full reaction set on hover. */}
      <LikeAction
        mine={mine}
        count={likes}
        onLike={() => react(mine ? mine.emoji : LIKE)}
        onPick={react}
      />

      <Action
        icon={
          <Bookmark
            className="size-[1.1rem]"
            fill={state.saved ? "currentColor" : "none"}
            aria-hidden
          />
        }
        label={state.saved ? "Saved" : "Save"}
        tone="brand"
        active={state.saved}
        onClick={save}
      />
    </div>
  );
}

const TONE = {
  brand: {
    idle: "text-foreground-muted group-hover/act:text-brand",
    halo: "group-hover/act:bg-brand-wash",
    on: "text-brand",
  },
  warm: {
    idle: "text-foreground-muted group-hover/act:text-terracotta",
    halo: "group-hover/act:bg-terracotta/10",
    on: "text-terracotta",
  },
} as const;

function Action({
  icon,
  count,
  label,
  tone,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  count?: number;
  label: string;
  tone: keyof typeof TONE;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "group/act -ml-1.5 inline-flex items-center gap-1 rounded-full py-1 pl-1.5 pr-2.5 transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        active ? t.on : t.idle,
      )}
    >
      {/* The tinted halo is on the icon, not the whole control — that is what
          keeps the row reading as content rather than as four buttons. */}
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full transition",
          t.halo,
          active && tone === "brand" && "bg-brand-wash",
        )}
      >
        {icon}
      </span>
      {count !== undefined && count > 0 ? (
        <span className="text-[13px] font-semibold tabular-nums">
          {formatCount(count)}
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function LikeAction({
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
      <button
        type="button"
        onClick={onLike}
        aria-pressed={Boolean(mine)}
        title={mine ? mine.label : "Like"}
        className={cn(
          "group/act -ml-1.5 inline-flex items-center gap-1 rounded-full py-1 pl-1.5 pr-2.5 transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          mine ? TONE.warm.on : TONE.warm.idle,
        )}
      >
        <span
          className={cn(
            "grid size-8 place-items-center rounded-full transition",
            TONE.warm.halo,
            mine && "bg-terracotta/10",
          )}
        >
          {mine ? (
            <ReactionIcon name={mine.icon} className="size-[1.15rem]" filled />
          ) : (
            <Heart className="size-[1.15rem]" aria-hidden />
          )}
        </span>
        {count > 0 ? (
          <span className="text-[13px] font-semibold tabular-nums">
            {formatCount(count)}
          </span>
        ) : null}
        <span className="sr-only">{mine ? mine.label : "Like"}</span>
      </button>

      {open ? (
        <div
          onFocus={hold}
          onBlur={close}
          className="absolute bottom-[calc(100%+0.3rem)] left-0 z-30 flex origin-bottom-left animate-[reaction-pop_140ms_ease-out] items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-e2"
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
                "grid size-8 place-items-center rounded-full transition hover:-translate-y-0.5 hover:bg-brand-wash",
                mine?.emoji === item.emoji && "bg-brand-wash text-brand",
              )}
            >
              <ReactionIcon
                name={item.icon}
                className="size-[1.05rem]"
                filled={mine?.emoji === item.emoji}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
