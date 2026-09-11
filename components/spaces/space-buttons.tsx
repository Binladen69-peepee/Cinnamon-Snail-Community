"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Star, UserPlus } from "lucide-react";
import {
  joinSpaceAction,
  leaveSpaceAction,
  toggleFavoriteSpaceAction,
} from "@/app/(member)/spaces/actions";
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
      <button
        type="button"
        onClick={join}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-bold transition active:scale-[0.97]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          "bg-forest text-paper hover:bg-deep-forest disabled:opacity-60",
          "dark:bg-brand dark:text-[#06120d] dark:hover:bg-brand-strong",
          size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-4 text-[13.5px]",
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-3.5" aria-hidden />
        )}
        Join
      </button>
      {error ? (
        <p className="text-[11.5px] font-semibold text-danger" role="alert">
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
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={leave}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-full bg-danger px-3 text-[12.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Leaving…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="inline-flex h-9 items-center rounded-full px-2.5 text-[12.5px] font-bold text-foreground-muted transition hover:text-foreground"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-bold text-foreground-muted transition hover:border-danger/50 hover:text-danger"
        >
          <Check className="size-3.5" aria-hidden />
          Joined
        </button>
      )}
      {error ? (
        <p className="max-w-48 text-right text-[11.5px] font-semibold text-danger" role="alert">
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
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={on}
      title={on ? "Remove from favourites" : "Add to favourites"}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        on
          ? "border-apricot/50 bg-apricot/15 text-apricot"
          : "border-border text-foreground-muted hover:border-apricot/50 hover:text-apricot",
      )}
    >
      <Star className={cn("size-4", on && "fill-current")} aria-hidden />
      <span className="sr-only">{on ? "Favourited" : "Add to favourites"}</span>
    </button>
  );
}
