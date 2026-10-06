"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Users, X } from "lucide-react";
import type { RsvpStatus } from "@prisma/client";
import { rsvpAction } from "@/app/(member)/live-classes/actions";
import { Button } from "@/components/app/ui";

/**
 * The seat.
 *
 * Four states, and the button says which one it is in rather than showing the
 * same word throughout: going, waiting with a place in the queue, full, and
 * not answered. A member who is nineteenth on a waitlist should be told that,
 * not left to guess whether pressing it worked.
 *
 * Only the unanswered state is a primary button. Once a member has said yes,
 * the button is a quiet secondary with a tick — the answer, which pressing
 * again takes back — so a list of events they are going to is not a list of
 * calls to action.
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
  quiet = false,
}: {
  eventId: string;
  status: RsvpStatus | null;
  waitlistPosition: number | null;
  goingCount: number;
  capacity: number | null;
  disabled?: boolean;
  disabledReason?: string;
  size?: "sm" | "md";
  /**
   * Never the primary button: for when "Join on Zoom" is on screen beside it,
   * and joining is the thing to do.
   */
  quiet?: boolean;
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
      <p className="text-label font-medium text-foreground-muted">
        {disabledReason ?? "RSVP is closed."}
      </p>
    );
  }

  // The card's control sits among meta text; the event page's is its action.
  const buttonSize = size === "sm" ? "sm" : "lg";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {going || waiting ? (
          <Button
            size={buttonSize}
            onClick={() => answer("NOT_GOING")}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : going ? (
              <Check className="size-4 text-success" aria-hidden />
            ) : (
              <Clock className="size-4" aria-hidden />
            )}
            {going
              ? "You're going"
              : `Waitlisted${state.waitlistPosition ? ` · #${state.waitlistPosition}` : ""}`}
          </Button>
        ) : (
          <Button
            size={buttonSize}
            variant={full || quiet ? "secondary" : "primary"}
            onClick={() => answer("GOING")}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : full ? (
              <Clock className="size-4" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            {full ? "Join the waitlist" : "I'm going"}
          </Button>
        )}

        <span className="inline-flex items-center gap-1.5 text-label tabular-nums text-foreground-muted">
          <Users className="size-4" aria-hidden />
          {capacity === null
            ? `${state.goingCount} going`
            : `${state.goingCount} of ${capacity}`}
        </span>
      </div>

      {going || waiting ? (
        <p className="text-caption text-foreground-muted">
          {going
            ? "Press again to cancel."
            : "We'll move you up the moment a place opens."}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1 text-caption font-medium text-danger"
        >
          <X className="size-3.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
