"use client";

import { useRef, useState, useTransition } from "react";
import { Bookmark, Heart, HelpCircle, PartyPopper, ThumbsUp, type LucideIcon } from "lucide-react";
import { reactAction } from "@/app/(member)/community-actions";
import { FACEBOOK_REACTIONS, FEED_REACTIONS } from "@/lib/community/facebook-reactions";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "❤️": Heart,
  "👍": ThumbsUp,
  "🎉": PartyPopper,
  "🙌": Bookmark,
  "🤔": HelpCircle,
  "🤗": Heart,
  "😆": PartyPopper,
  "😮": HelpCircle,
  "😢": HelpCircle,
  "😡": HelpCircle,
};

export function FacebookReactions({
  postId,
  counts: _counts,
  myReaction,
  total,
}: {
  postId: string;
  counts: Record<string, number>;
  myReaction: string | null;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const closeTimer = useRef<number | null>(null);
  const current = FACEBOOK_REACTIONS.find((item) => item.emoji === myReaction);
  const CurrentIcon = ICONS[current?.emoji ?? "❤️"] ?? Heart;

  function pick(emoji: string) {
    const data = new FormData();
    data.set("postId", postId);
    data.set("emoji", emoji);
    startTransition(() => {
      void reactAction(data);
    });
    setOpen(false);
  }

  function show() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function hide() {
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2" onMouseEnter={show} onMouseLeave={hide}>
      {open ? (
        <div
          className="vu-card absolute bottom-[calc(100%+8px)] left-0 z-20 flex items-center gap-1 px-2 py-1.5"
          role="listbox"
          aria-label="Reactions"
        >
          {FEED_REACTIONS.map((item) => {
            const Icon = ICONS[item.emoji] ?? Heart;
            const count = _counts[item.emoji] ?? 0;
            return (
              <button
                key={item.emoji}
                type="button"
                className="reaction-pop relative grid size-10 place-items-center rounded-full text-forest transition hover:-translate-y-1 hover:bg-sage"
                aria-label={count ? `${item.label}, ${count}` : item.label}
                onClick={() => pick(item.emoji)}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => pick(current?.emoji ?? "❤️")}
        className={cn(
          "inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
          myReaction ? "bg-sage text-forest" : "text-foreground-muted hover:bg-mint",
        )}
        aria-pressed={Boolean(myReaction)}
      >
        <CurrentIcon className="size-4" aria-hidden />
        {current?.label ?? "Love"}
        {total > 0 ? <span className="tabular-nums">{total}</span> : null}
      </button>
    </div>
  );
}
