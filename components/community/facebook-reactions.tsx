"use client";

import { useRef, useState, useTransition } from "react";
import { reactAction } from "@/app/(member)/community-actions";
import { FACEBOOK_REACTIONS } from "@/lib/community/facebook-reactions";
import { cn } from "@/lib/utils";

export function FacebookReactions({
  postId,
  counts,
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

  const visible = FACEBOOK_REACTIONS.filter((item) => (counts[item.emoji] ?? 0) > 0);

  return (
    <div className="relative flex flex-wrap items-center gap-2" onMouseEnter={show} onMouseLeave={hide}>
      {open ? (
        <div
          className="vu-card absolute bottom-[calc(100%+8px)] left-0 z-20 flex items-center gap-1 px-2 py-1.5"
          role="listbox"
          aria-label="Reactions"
        >
          {FACEBOOK_REACTIONS.map((item) => (
            <button
              key={item.emoji}
              type="button"
              className="grid size-9 place-items-center text-lg transition-transform hover:-translate-y-1 hover:scale-110"
              aria-label={item.label}
              onClick={() => pick(item.emoji)}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => pick(current?.emoji ?? "👍")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 bg-background px-3 text-xs font-semibold",
          myReaction ? "text-accent" : "text-foreground",
        )}
        style={{ borderRadius: 12 }}
        aria-pressed={Boolean(myReaction)}
      >
        <span aria-hidden>{current?.emoji ?? "👍"}</span>
        {current?.label ?? "Like"}
      </button>
      {total > 0 ? (
        <p className="flex items-center gap-1 text-xs text-foreground-muted">
          {visible.slice(0, 3).map((item) => (
            <span key={item.emoji} title={`${item.label} ${counts[item.emoji]}`}>
              {item.emoji}
            </span>
          ))}
          <span className="font-semibold text-foreground">{total}</span>
        </p>
      ) : null}
    </div>
  );
}
