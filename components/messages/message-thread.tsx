"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { sendMessageAction } from "@/app/(member)/messages/actions";
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
};

type PollResponse = {
  messages: ThreadMessage[];
  typing: string[];
  readReceipts: { name: string; lastReadAt: string | null }[];
};

const POLL_INTERVAL_MS = 4000;
const TYPING_PING_MS = 3000;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageThread({
  conversationId,
  initialMessages,
  isGroup,
}: {
  conversationId: string;
  initialMessages: ThreadMessage[];
  isGroup: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [typing, setTyping] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<PollResponse["readReceipts"]>([]);
  const [state, formAction, pending] = useActionState(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastTypingPing = useRef(0);
  const cursor = messages.at(-1)?.createdAt ?? null;

  const poll = useCallback(async () => {
    const params = new URLSearchParams({ read: "1" });
    if (cursor) params.set("since", cursor);
    try {
      const response = await fetch(
        `/api/messages/${conversationId}/poll?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data: PollResponse = await response.json();
      if (data.messages.length > 0) {
        setMessages((current) => {
          const seen = new Set(current.map((message) => message.id));
          const incoming = data.messages.filter((message) => !seen.has(message.id));
          return incoming.length > 0 ? [...current, ...incoming] : current;
        });
      }
      setTyping(data.typing);
      setReceipts(data.readReceipts);
    } catch {
      // A dropped poll is not worth surfacing; the next tick retries.
    }
  }, [conversationId, cursor]);

  useEffect(() => {
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Clearing the composer after a successful send keeps the form usable.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state.error]);

  function pingTyping() {
    const now = Date.now();
    if (now - lastTypingPing.current < TYPING_PING_MS) return;
    lastTypingPing.current = now;
    void fetch(`/api/messages/${conversationId}/poll`, { method: "POST" }).catch(
      () => {},
    );
  }

  const lastMine = [...messages].reverse().find((message) => message.mine);
  const readBy = lastMine
    ? receipts.filter(
        (receipt) =>
          receipt.lastReadAt && receipt.lastReadAt >= lastMine.createdAt,
      )
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol className="flex-1 space-y-3 overflow-y-auto px-1 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted">
            No messages yet. Say hello.
          </li>
        ) : null}
        {messages.map((message) => (
          <li
            key={message.id}
            className={cn("flex gap-3", message.mine && "flex-row-reverse")}
          >
            {!message.mine ? (
              <Avatar name={message.authorName} src={message.authorAvatar} size="sm" />
            ) : null}
            <div className={cn("max-w-[78%]", message.mine && "text-right")}>
              {isGroup && !message.mine ? (
                <p className="mb-1 text-xs font-semibold text-olive">
                  {message.authorName}
                </p>
              ) : null}
              <div
                className={cn(
                  "inline-block rounded-3xl px-4 py-2.5 text-left text-[0.95rem] leading-relaxed",
                  message.mine
                    ? "bg-forest text-paper dark:bg-surface dark:text-foreground dark:ring-1 dark:ring-border"
                    : "bg-sage/60 text-ink dark:bg-surface dark:text-foreground",
                )}
              >
                {message.imageUrl ? (
                  // Member-shared images are arbitrary URLs, not optimizer inputs.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.imageUrl}
                    alt=""
                    className="mb-2 max-h-72 rounded-2xl object-cover"
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
                          rel="noreferrer nofollow"
                          className="underline underline-offset-2"
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
              <p className="mt-1 text-[11px] text-muted">{timeLabel(message.createdAt)}</p>
            </div>
          </li>
        ))}
        <div ref={bottomRef} />
      </ol>

      <div className="min-h-5 px-1 text-xs text-olive" aria-live="polite">
        {typing.length > 0
          ? `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`
          : readBy.length > 0
            ? `Read by ${readBy.map((receipt) => receipt.name).join(", ")}`
            : null}
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="mt-2 border-t border-sand pt-4"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <div className="flex items-end gap-2">
          <textarea
            name="body"
            rows={2}
            onChange={pingTyping}
            placeholder="Write a message"
            className="min-h-12 flex-1 resize-none rounded-2xl border border-sand bg-surface px-4 py-3 text-sm outline-none focus-visible:border-accent"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
        <input
          name="imageUrl"
          type="url"
          placeholder="Image URL (optional)"
          className="mt-2 w-full rounded-2xl border border-sand bg-surface px-4 py-2 text-xs outline-none focus-visible:border-accent"
        />
        {state.error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
