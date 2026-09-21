"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { autoLink } from "@/lib/messages/format";
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
}: {
  message: ThreadMessage;
  /** False when the previous message was from the same person. */
  showAvatar: boolean;
  /** Groups need a name above the first bubble in a run; 1:1 threads do not. */
  showName: boolean;
  readByAll: boolean;
  onRetry?: (message: ThreadMessage) => void;
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
        <span className={cn("w-7 shrink-0", showAvatar ? "" : "invisible")}>
          <Avatar
            name={message.authorName}
            src={message.authorAvatar}
            size="sm"
            className="size-7 text-[10px]"
          />
        </span>
      ) : null}

      <div
        className={cn(
          "flex min-w-0 max-w-[min(78%,34rem)] flex-col",
          message.mine ? "items-end" : "items-start",
        )}
      >
        {showName && !message.mine ? (
          <span className="mb-0.5 px-1 text-[11.5px] font-bold text-foreground-muted">
            {message.authorName}
          </span>
        ) : null}

        <div
          className={cn(
            "relative rounded-2xl px-3 py-2 text-[14px] leading-snug",
            message.mine
              ? "rounded-br-sm bg-brand-fill text-brand-fill-foreground"
              : "rounded-bl-sm border border-border bg-surface text-foreground",
            message.state === "failed" && "opacity-70 ring-1 ring-danger",
          )}
        >
          {message.imageUrl ? (
            // Member uploads are served through our own signed-read route.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.imageUrl}
              alt={message.body || "Shared image"}
              className="mb-1.5 max-h-80 w-full rounded-ctl object-cover"
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
                      message.mine ? "text-brand-fill-foreground" : "text-brand",
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
        </div>

        <span
          className={cn(
            "mt-0.5 flex items-center gap-1 px-1 text-[10.5px] tabular-nums text-foreground-muted",
            message.mine ? "flex-row-reverse" : "",
          )}
        >
          <time dateTime={at.toISOString()}>{time}</time>
          {message.mine ? <DeliveryMark state={message.state} read={readByAll} /> : null}
          {message.state === "failed" && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="font-semibold text-danger underline underline-offset-2"
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
