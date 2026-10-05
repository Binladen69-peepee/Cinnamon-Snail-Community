"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Star, UserPlus } from "lucide-react";
import {
  joinSpaceAction,
  leaveSpaceAction,
  toggleFavoriteSpaceAction,
} from "@/app/(member)/spaces/actions";
import { Button } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * Join, leave and favourite.
 *
 * Client components rather than bare forms so the pressed state lands
 * immediately and a refusal — a private room, a host who cannot abandon their
 * own space — shows up next to the button that caused it rather than as a
 * blank error page.
 */
export function JoinButton({
  spaceId,
  slug,
  size = "md",
}: {
  spaceId: string;
  slug: string;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function join() {
    const data = new FormData();
    data.set("spaceId", spaceId);
    data.set("slug", slug);
    start(async () => {
      const result = await joinSpaceAction(data);
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Button variant="primary" size={size} onClick={join} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        Join
      </Button>
      {error ? (
        <p className="text-caption font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function LeaveButton({
  spaceId,
  slug,
}: {
  spaceId: string;
  slug: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function leave() {
    const data = new FormData();
    data.set("spaceId", spaceId);
    data.set("slug", slug);
    start(async () => {
      const result = await leaveSpaceAction(data);
      setError(result.ok ? null : result.error);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        // One step of confirmation: leaving loses your unread position and, in
        // a private room, your way back in.
        <span className="flex items-center gap-1.5">
          <Button variant="danger" onClick={leave} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? "Leaving…" : "Confirm"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          <Check className="size-4" aria-hidden />
          Joined
        </Button>
      )}
      {error ? (
        <p className="max-w-48 text-right text-caption font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FavoriteButton({
  spaceId,
  slug,
  favorite,
}: {
  spaceId: string;
  slug: string;
  favorite: boolean;
}) {
  const [pending, start] = useTransition();
  // Optimistic: the star is the cheapest possible write and should never wait.
  const [on, setOn] = useState(favorite);

  function toggle() {
    const next = !on;
    setOn(next);
    const data = new FormData();
    data.set("spaceId", spaceId);
    data.set("slug", slug);
    start(async () => {
      const result = await toggleFavoriteSpaceAction(data);
      if (!result.ok) setOn(!next);
    });
  }

  return (
    <Button
      variant="secondary"
      iconOnly
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      title={on ? "Remove from favourites" : "Add to favourites"}
    >
      {/* The button face stays neutral; the star itself carries the state, in
          the brand colour and filled, so it reads on both grounds. */}
      <Star className={cn("size-4", on && "fill-current text-brand")} aria-hidden />
      <span className="sr-only">{on ? "Favourited" : "Add to favourites"}</span>
    </Button>
  );
}
