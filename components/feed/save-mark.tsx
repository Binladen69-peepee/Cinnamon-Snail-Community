"use client";

import { useOptimistic, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { saveAction } from "@/app/(member)/community-actions";
import { cn } from "@/lib/utils";

/** Bookmark control that lives in the vote column, matching the feed mock. */
export function SaveMark({ postId, saved }: { postId: string; saved: boolean }) {
  const [, startTransition] = useTransition();
  const [on, apply] = useOptimistic(saved);

  return (
    <button
      type="button"
      onClick={() => {
        const data = new FormData();
        data.set("postId", postId);
        startTransition(async () => {
          apply(!on);
          await saveAction(data);
        });
      }}
      aria-label={on ? "Unsave" : "Save"}
      aria-pressed={on}
      className={cn(
        "grid size-7 place-items-center rounded-md transition",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
        on
          ? "text-brand"
          : "text-foreground-muted hover:bg-mint hover:text-foreground",
      )}
    >
      <Bookmark className="size-4" fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}
