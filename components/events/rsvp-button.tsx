"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Users, X } from "lucide-react";
import type { RsvpStatus } from "@prisma/client";
import { rsvpAction } from "@/app/(member)/calendar/actions";
import { cn } from "@/lib/utils";

/**
 * The seat.
 *
 * Four states, and the button says which one it is in rather than showing the
 * same word throughout: going, waiting with a place in the queue, full, and
 * not answered. A member who is nineteenth on a waitlist should be told that,
 * not left to guess whether pressing it worked.
 *
 * The count next to it is the server's answer from this very call, so it
 * settles immediately rather than after a refresh. It is deliberately not
 * optimistic: capacity is the one number that must not be guessed, because
 * guessing it is how two people are both told they got the last seat.
 */
export function RsvpButton({
  eventId,
  status,
  waitlistPosition,
  goingCount,
  capacity,
  disabled,
  disabledReason,
  size = "md",
}: {
  eventId: string;
  status: RsvpStatus | null;
  waitlistPosition: number | null;
  goingCount: number;
  capacity: number | null;
  disabled?: boolean;
  disabledReason?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [state, setState] = useState({ status, waitlistPosition, goingCount });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const going = state.status === "GOING";
  const waiting = state.status === "WAITLIST";
  const full = capacity !== null && state.goingCount >= capacity && !going;

  function answer(next: RsvpStatus) {
    setError(null);
    startTransition(async () => {
      const result = await rsvpAction(eventId, next);
      if (result.ok) {
        setState({
          status: result.outcome.status,
          waitlistPosition: result.outcome.waitlistPosition,
          goingCount: result.outcome.goingCount,
        });
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (disabled) {
    return (
      <p className="text-[12.5px] font-semibold text-foreground-muted">
        {disabledReason ?? "RSVP is closed."}
      </p>
    );
  }

  const height = size === "sm" ? "h-8 text-[12.5px]" : "h-10 text-[14px]";

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {going || waiting ? (
          <button
            type="button"
            onClick={() => answer("NOT_GOING")}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-ctl border px-3.5 font-semibold transition",
              height,
              going
                ? "border-brand/40 bg-brand-wash text-brand-strong hover:border-danger/50 hover:text-danger"
                : "border-border bg-surface text-foreground hover:border-hairline-firm",
              pending && "opacity-70",
            )}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : going ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Clock className="size-3.5" aria-hidden />
            )}
            {going
              ? "You're going"
              : `Waitlisted${state.waitlistPosition ? ` · #${state.waitlistPosition}` : ""}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => answer("GOING")}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-ctl px-4 font-semibold transition",
              height,
              full
                ? "border border-border bg-surface text-foreground hover:border-hairline-firm"
                : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
              pending && "opacity-70",
            )}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : full ? (
              <Clock className="size-3.5" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            {full ? "Join the waitlist" : "I'm going"}
          </button>
        )}

        <span className="inline-flex items-center gap-1 text-[12.5px] tabular-nums text-foreground-muted">
          <Users className="size-3.5" aria-hidden />
          {capacity === null
            ? `${state.goingCount} going`
            : `${state.goingCount} of ${capacity}`}
        </span>
      </div>

      {going || waiting ? (
        <p className="text-[11.5px] text-foreground-muted">
          {going
            ? "Press again to cancel."
            : "We'll move you up the moment a place opens."}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-center gap-1 text-[12px] font-semibold text-danger">
          <X className="size-3" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
