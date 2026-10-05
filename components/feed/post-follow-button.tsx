"use client";

import { useOptimistic, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { toggleFollowAction } from "@/app/(member)/follow-actions";
import { Button } from "@/components/app/ui";

/**
 * Compact follow control for post headers, member cards and reels.
 *
 * Primary while it is an invitation, secondary once it is a state: a row of
 * people you already follow should not be a row of filled buttons.
 */
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
    <Button
      size="sm"
      variant={following ? "secondary" : "primary"}
      onClick={onClick}
      className={className}
    >
      {!following ? <UserPlus className="size-3.5" aria-hidden /> : null}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
