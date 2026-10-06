import Link from "next/link";
import { ArrowUpRight, Clock, Lock, Video } from "lucide-react";
import type { JoinState } from "@/lib/events/join";
import { ButtonLink, Callout, buttonClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * "Join on Zoom", or why it is not here yet (DEC-079).
 *
 * The state is decided on the server (`lib/events/join.ts`), and the link is
 * only in the page when the state is "open", so nothing here can show a link
 * to someone who should not have it. Every other state is one short line that
 * says what will happen, because a missing button with no explanation reads
 * as a broken page twenty minutes before a class.
 *
 * `size="lg"` is the class page, where joining is the page's main action;
 * `size="sm"` sits on a card beside the RSVP.
 */
export function JoinControl({
  join,
  size = "sm",
  className,
}: {
  join: JoinState;
  size?: "sm" | "lg";
  className?: string;
}) {
  const line = cn(
    "inline-flex items-center gap-1.5 text-foreground-muted [&_svg]:size-4 [&_svg]:shrink-0",
    size === "lg" ? "text-body" : "text-label",
    className,
  );

  switch (join.kind) {
    case "open":
      return (
        <a
          href={join.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({
            variant: "primary",
            size: size === "lg" ? "lg" : "sm",
            className: cn(size === "lg" && "w-full sm:w-fit", className),
          })}
        >
          <Video className="size-4" aria-hidden />
          Join on Zoom
          <ArrowUpRight className="size-3.5 opacity-80" aria-hidden />
          <span className="sr-only">(opens Zoom in a new tab)</span>
        </a>
      );

    case "opens-soon":
      return (
        <p className={line}>
          <Clock aria-hidden />
          Link appears 30 minutes before
        </p>
      );

    case "needs-seat":
      return (
        <p className={line}>
          <Lock aria-hidden />
          {join.waitlisted
            ? "The Zoom link is yours if a seat opens."
            : "Say you're going to get the Zoom link."}
        </p>
      );

    case "members-only":
      // On the class page this is the answer to "why can't I join?", so it
      // gets a proper explanation and a way to fix it.
      if (size === "lg") {
        const expired = join.membership === "expired";
        return (
          <Callout
            tone="neutral"
            icon={<Lock />}
            title={expired ? "Your membership has run out" : "Live classes are for members"}
            className={className}
          >
            {expired
              ? "Renew and the Zoom link appears here half an hour before every class."
              : "Members join every live class on Zoom and catch up on the recordings."}
            <span className="mt-3 block">
              <ButtonLink href={expired ? "/billing" : "/membership"} size="sm" variant="primary">
                {expired ? "Check your membership" : "See membership"}
              </ButtonLink>
            </span>
          </Callout>
        );
      }
      return (
        <p className={cn(line, "flex-wrap")}>
          <Lock aria-hidden />
          <span>
            {join.membership === "expired"
              ? "Your membership has run out."
              : "Live classes are for members."}{" "}
            <Link
              href={join.membership === "expired" ? "/billing" : "/membership"}
              className="font-semibold text-link no-underline hover:underline"
            >
              {join.membership === "expired" ? "Check your membership" : "See membership"}
            </Link>
          </span>
        </p>
      );

    case "no-link":
      return size === "lg" ? (
        <p className={line}>
          <Video aria-hidden />
          The Zoom link has not been added yet.
        </p>
      ) : null;

    case "ended":
    case "canceled":
      return null;
  }
}
