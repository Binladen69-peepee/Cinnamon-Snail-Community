"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { autoLink, linksIn } from "@/lib/messages/format";
import { LinkCard } from "@/components/messages/link-card";
import type { LinkPreview } from "@/lib/messages/link-preview";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  mine: boolean;
  /** Set while an optimistic message is still in flight, or if it failed. */
  state?: "sending" | "failed";
};

/**
 * One message.
 *
 * Sent and received differ by **alignment, colour and a tail** rather than
 * colour alone — the accessibility guidance for chat is explicit that colour
 * cannot be the only carrier of who said what, and it is also what makes a
 * thread readable in a screenshot or in high-contrast mode.
 *
 * Own bubbles take the brand fill and the other side's the muted surface.
 * Both are role tokens, so neither turns into a white slab in dark mode: the
 * fill there is a lifted forest, not an inversion of the light one.
 *
 * Own messages carry a delivery mark: a clock while in flight, one tick once
 * stored, two once the other side has read past it. Nothing is invented — the
 * second tick comes from their real `lastReadAt`.
 */
export function MessageBubble({
  message,
  showAvatar,
  showName,
  readByAll,
  onRetry,
  previews,
}: {
  message: ThreadMessage;
  /** False when the previous message was from the same person. */
  showAvatar: boolean;
  /** Groups need a name above the first bubble in a run; 1:1 threads do not. */
  showName: boolean;
  readByAll: boolean;
  onRetry?: (message: ThreadMessage) => void;
  /** Unfurled internal links, keyed by URL. Empty for external ones. */
  previews?: Map<string, LinkPreview>;
}) {
  const at = new Date(message.createdAt);
  const time = at.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li
      className={cn(
        "flex w-full items-end gap-2",
        message.mine ? "justify-end" : "justify-start",
      )}
    >
      {!message.mine ? (
        <span className={cn("w-6 shrink-0", showAvatar ? "" : "invisible")}>
          <Avatar name={message.authorName} src={message.authorAvatar} size="xs" />
        </span>
      ) : null}

      <div
        className={cn(
          "flex min-w-0 max-w-[min(78%,34rem)] flex-col",
          message.mine ? "items-end" : "items-start",
        )}
      >
        {showName && !message.mine ? (
          <span className="mb-0.5 px-1 text-caption font-medium text-foreground-muted">
            {message.authorName}
          </span>
        ) : null}

        <div
          className={cn(
            "relative rounded-card px-3 py-2 text-body leading-snug",
            message.mine
              ? "rounded-br-chip bg-brand-fill text-brand-fill-foreground"
              : "rounded-bl-chip bg-surface-muted text-foreground",
            message.state === "failed" && "opacity-70 ring-1 ring-danger",
          )}
        >
          {message.imageUrl ? (
            // Member uploads are served through our own signed-read route.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.imageUrl}
              alt={message.body || "Shared image"}
              className="mb-1.5 max-h-80 w-full rounded-ctl bg-default object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}

          {message.body ? (
            <p className="whitespace-pre-wrap break-words">
              {autoLink(message.body).map((part, index) =>
                part.href ? (
                  <a
                    key={index}
                    href={part.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className={cn(
                      "underline underline-offset-2",
                      message.mine ? "text-brand-fill-foreground" : "text-brand-strong",
                    )}
                  >
                    {part.text}
                  </a>
                ) : (
                  <span key={index}>{part.text}</span>
                ),
              )}
            </p>
          ) : null}

          {/* One card per distinct internal link in the message. External
              links stay as links: see `lib/messages/link-preview.ts`. */}
          {previews && message.body
            ? [...new Set(linksIn(message.body))].flatMap((url) => {
                const preview = previews.get(url);
                return preview
                  ? [<LinkCard key={url} preview={preview} mine={message.mine} />]
                  : [];
              })
            : null}
        </div>

        <span
          className={cn(
            "mt-0.5 flex items-center gap-1 px-1 text-micro tabular-nums text-foreground-muted",
            message.mine ? "flex-row-reverse" : "",
          )}
        >
          <time dateTime={at.toISOString()}>{time}</time>
          {message.mine ? <DeliveryMark state={message.state} read={readByAll} /> : null}
          {message.state === "failed" && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="font-semibold text-danger underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function DeliveryMark({
  state,
  read,
}: {
  state: ThreadMessage["state"];
  read: boolean;
}) {
  if (state === "sending") {
    return (
      <>
        <Clock className="size-3" aria-hidden />
        <span className="sr-only">Sending</span>
      </>
    );
  }
  if (state === "failed") {
    return (
      <>
        <AlertCircle className="size-3 text-danger" aria-hidden />
        <span className="sr-only">Not sent</span>
      </>
    );
  }
  if (read) {
    return (
      <>
        <CheckCheck className="size-3 text-brand" aria-hidden />
        <span className="sr-only">Read</span>
      </>
    );
  }
  return (
    <>
      <Check className="size-3" aria-hidden />
      <span className="sr-only">Sent</span>
    </>
  );
}
