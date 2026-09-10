"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { CommentPanel } from "@/components/community/comment-panel";

/**
 * A comment thread with its own show/hide trigger, for places that are not the
 * feed — a lesson discussion, for instance — where there is no action bar to
 * host the toggle.
 */
export function CommentDisclosure({
  postId,
  viewer,
  openLabel = "Show the discussion",
  closeLabel = "Hide the discussion",
}: {
  postId: string;
  viewer: { name: string; avatar: string | null };
  openLabel?: string;
  closeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-sand px-4 text-sm font-semibold text-forest transition hover:border-accent"
      >
        <MessageCircle className="size-4" aria-hidden />
        {open ? closeLabel : openLabel}
        {count !== null && count > 0 ? (
          <span className="rounded-full bg-sage px-2 py-0.5 text-xs font-bold">
            {count}
          </span>
        ) : null}
      </button>
      <CommentPanel
        postId={postId}
        open={open}
        viewer={viewer}
        onCountChange={setCount}
      />
    </div>
  );
}
