"use client";

import { useOptimistic, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toggleFollowAction } from "@/app/(member)/follow-actions";
import { cn } from "@/lib/utils";

/** Compact LinkedIn-style follow control for post headers. */
export function PostFollowButton({
  handle,
  initialFollowing = false,
  className,
}: {
  handle: string;
  initialFollowing?: boolean;
  className?: string;
}) {
  const [, start] = useTransition();
  const [following, setFollowing] = useOptimistic(
    initialFollowing,
    (_current, next: boolean) => next,
  );

  function onClick(event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const next = !following;
    const data = new FormData();
    data.set("handle", handle);
    start(async () => {
      setFollowing(next);
      await toggleFollowAction(data);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition",
        following
          ? "border border-border text-foreground-muted hover:bg-mint"
          : "text-link hover:bg-default",
        className,
      )}
    >
      {!following ? <UserPlus className="size-3.5" aria-hidden /> : null}
      {following ? "Following" : "Follow"}
    </button>
  );
}
