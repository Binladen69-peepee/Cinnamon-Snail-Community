"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { MessageBubble, type ThreadMessage } from "@/components/messages/message-bubble";
import { ThreadComposer } from "@/components/messages/thread-composer";
import { ThreadMenu } from "@/components/messages/thread-menu";
import { groupByDay } from "@/lib/messages/day-groups";
import { sendMessageAction } from "@/app/(member)/messages/actions";

export type ThreadOther = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string | null;
  blockedByViewer: boolean;
};

/** How often to ask for new messages. DEC-016: polling until realtime lands. */
const POLL_MS = 4000;
/** Below this many pixels from the bottom, we follow new messages down. */
const STICK_PX = 120;

/**
 * A conversation.
 *
 * Delivery is the existing poll route, which already returns messages since a
 * cursor plus typing flags and read receipts — this only has to ask, and to
 * stop asking when the tab is hidden, because a background tab polling every
 * four seconds is how a phone battery disappears.
 *
 * Scrolling follows the rule every chat client converges on: stay pinned to the
 * bottom while you are at the bottom, and never yank someone who has scrolled
 * up to read. When a message arrives while they are up there, they get a button
 * instead of a jump.
 */
export function Thread({
  conversationId,
  title,
  isGroup,
  others,
  initialMessages,
  uploadsEnabled,
}: {
  conversationId: string;
  title: string;
  isGroup: boolean;
  others: ThreadOther[];
  initialMessages: ThreadMessage[];
  uploadsEnabled: boolean;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [typing, setTyping] = useState<string[]>([]);
  const [receipts, setReceipts] = useState(
    others.map((other) => ({ name: other.name, lastReadAt: other.lastReadAt })),
  );
  const [error, setError] = useState<string | null>(null);
  const [behind, setBehind] = useState(false);
  // A refused send must not swallow what was typed. The gate is re-checked on
  // every message -- a block or a changed preference mid-thread is an ordinary
  // outcome, not an exotic one -- so the draft comes back to the composer.
  const [restore, setRestore] = useState<{
    token: number;
    body: string;
    imageUrl: string | null;
  } | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic sends live beside the confirmed list rather than inside it, so a
  // poll that arrives mid-flight cannot drop the message being typed.
  const [pending, addPending] = useOptimistic<ThreadMessage[], ThreadMessage>(
    [],
    (current, message) => [...current, message],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
  const cursorRef = useRef<string | null>(
    initialMessages.at(-1)?.createdAt ?? null,
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
    setBehind(false);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stuckRef.current = distance < STICK_PX;
    if (stuckRef.current) setBehind(false);
  }

  const poll = useCallback(async () => {
    const since = cursorRef.current;
    const params = new URLSearchParams({ read: "1" });
    if (since) params.set("since", since);
    try {
      const response = await fetch(
        `/api/messages/${conversationId}/poll?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        messages: ThreadMessage[];
        typing: string[];
        readReceipts: { name: string; lastReadAt: string | null }[];
      };
      setTyping(data.typing);
      setReceipts(data.readReceipts);
      if (data.messages.length > 0) {
        cursorRef.current = data.messages.at(-1)?.createdAt ?? since;
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id));
          const fresh = data.messages.filter((message) => !known.has(message.id));
          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
        if (stuckRef.current) {
          // Wait for the new rows to lay out before chasing the bottom.
          requestAnimationFrame(() => scrollToBottom("smooth"));
        } else {
          setBehind(true);
        }
      }
    } catch {
      // A dropped poll is not worth an error state; the next one will catch up.
    }
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    let timer = window.setInterval(poll, POLL_MS);
    function onVisibility() {
      window.clearInterval(timer);
      if (document.visibilityState === "visible") {
        void poll();
        timer = window.setInterval(poll, POLL_MS);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  function submit(body: string, imageUrl: string | null) {
    setError(null);
    const optimistic: ThreadMessage = {
      id: `pending-${Date.now()}`,
      body,
      imageUrl,
      createdAt: new Date().toISOString(),
      authorId: "me",
      authorName: "You",
      authorAvatar: null,
      mine: true,
      state: "sending",
    };

    const data = new FormData();
    data.set("conversationId", conversationId);
    data.set("body", body);
    if (imageUrl) data.set("imageUrl", imageUrl);

    startTransition(async () => {
      addPending(optimistic);
      stuckRef.current = true;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      const result = await sendMessageAction(data);
      if (!result.ok) {
        setError(result.error);
        setRestore({ token: Date.now(), body, imageUrl });
        return;
      }
      await poll();
    });
  }

  const all = [...messages, ...pending];
  const groups = groupByDay(all);
  // The furthest point every other member has read to. One tick until then.
  const readThrough = receipts.reduce<number>((earliest, receipt) => {
    const at = receipt.lastReadAt ? new Date(receipt.lastReadAt).getTime() : 0;
    return Math.min(earliest, at);
  }, Number.POSITIVE_INFINITY);

  const blockedOther = others.find((other) => other.blockedByViewer);

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5">
        <Link
          href="/messages"
          aria-label="Back to conversations"
          className="-ml-1 grid size-8 shrink-0 place-items-center rounded-full text-foreground-muted no-underline transition hover:bg-brand-wash hover:text-brand-strong lg:hidden"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>

        {others.length === 1 ? (
          <Link href={`/members/${others[0].handle}`} className="shrink-0 no-underline">
            <Avatar
              name={others[0].name}
              src={others[0].avatarUrl}
              size="sm"
              className="size-9"
            />
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold text-foreground">{title}</h1>
          <p className="truncate text-[12px] text-foreground-muted" aria-live="polite">
            {typing.length > 0
              ? `${typing.join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`
              : isGroup
                ? `${others.length + 1} people`
                : `@${others[0]?.handle ?? ""}`}
          </p>
        </div>

        <ThreadMenu
          conversationId={conversationId}
          isGroup={isGroup}
          others={others}
        />
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {all.length === 0 ? (
          <p className="mx-auto mt-10 max-w-[38ch] text-center text-[14px] text-foreground-muted">
            No messages yet. Say hello — a first message is usually about what
            you are cooking this week.
          </p>
        ) : null}

        {groups.map((group) => (
          <div key={group.day}>
            <p className="sticky top-0 z-10 my-2 flex justify-center">
              <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-semibold text-foreground-muted shadow-e1 backdrop-blur">
                {group.label}
              </span>
            </p>
            <ul className="space-y-1.5">
              {group.messages.map((message, index) => {
                const previous = group.messages[index - 1];
                const newSpeaker = previous?.authorId !== message.authorId;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    showAvatar={newSpeaker}
                    showName={isGroup && newSpeaker}
                    readByAll={
                      message.mine &&
                      message.state === undefined &&
                      new Date(message.createdAt).getTime() <= readThrough
                    }
                  />
                );
              })}
            </ul>
          </div>
        ))}

        {/* Screen readers get arrivals announced without the list being a live
            region, which would re-read the whole thread on every poll. */}
        <p className="sr-only" aria-live="polite">
          {messages.at(-1) && !messages.at(-1)?.mine
            ? `${messages.at(-1)?.authorName} said ${messages.at(-1)?.body}`
            : ""}
        </p>
      </div>

      {behind ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="absolute bottom-2 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-fill px-3 py-1.5 text-[12.5px] font-semibold text-brand-fill-foreground shadow-e2"
          >
            <ArrowDown className="size-3.5" aria-hidden />
            New messages
          </button>
        </div>
      ) : null}

      {blockedOther ? (
        <p className="shrink-0 border-t border-border bg-surface px-3 py-3 text-center text-[13px] text-foreground-muted">
          You blocked {blockedOther.name}. Unblock them from the menu above to
          write again.
        </p>
      ) : (
        <ThreadComposer
          conversationId={conversationId}
          uploadsEnabled={uploadsEnabled}
          error={error}
          restore={restore}
          onSend={submit}
        />
      )}
    </section>
  );
}
