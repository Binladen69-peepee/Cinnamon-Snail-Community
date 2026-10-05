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
import { useRouter } from "next/navigation";
import { ArrowDown, MessageSquare, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, EmptyState } from "@/components/app/ui";
import { PaneBackLink, PaneHeader } from "@/components/messages/pane-header";
import { MessageBubble, type ThreadMessage } from "@/components/messages/message-bubble";
import { ThreadComposer } from "@/components/messages/thread-composer";
import { ThreadMenu } from "@/components/messages/thread-menu";
import { groupByDay } from "@/lib/messages/day-groups";
import {
  loadOlderMessagesAction,
  sendMessageAction,
} from "@/app/(member)/messages/actions";
import { useMessageStream } from "@/components/messages/use-message-stream";
import type { LinkPreview } from "@/lib/messages/link-preview";
import { StreamStatus } from "@/components/messages/stream-status";

export type ThreadOther = {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string | null;
  blockedByViewer: boolean;
};

/** Below this many pixels from the bottom, we follow new messages down. */
const STICK_PX = 120;
/** How often an arrival may re-render the conversation list beside the thread. */
const REFRESH_THROTTLE_MS = 5000;

/** A key per composed message, so a retry cannot send it twice. */
function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A conversation.
 *
 * Delivery is the poll route, driven by `useMessageStream` — which follows
 * attention, backs off when the server is unwell, and knows when the browser
 * is offline, so the thread says "reconnecting" instead of quietly going
 * stale. DEC-017 keeps this polling until a realtime vendor exists.
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
  initialPreviews,
  hasMore,
  uploadsEnabled,
}: {
  conversationId: string;
  title: string;
  isGroup: boolean;
  others: ThreadOther[];
  initialMessages: ThreadMessage[];
  initialPreviews: LinkPreview[];
  /** True when there are older messages above the first one shown. */
  hasMore: boolean;
  uploadsEnabled: boolean;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [previews, setPreviews] = useState<Map<string, LinkPreview>>(
    () => new Map(initialPreviews.map((preview) => [preview.url, preview])),
  );
  const [older, setOlder] = useState({ hasMore, loading: false });
  // Why the page above could not be fetched, when it could not. The action
  // already says; this only keeps the reason on screen instead of dropping it.
  const [olderError, setOlderError] = useState<string | null>(null);
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

  const router = useRouter();
  // The conversation list beside this thread is a server component, so a
  // message arriving here leaves its preview and its unread badge stale —
  // "no messages yet" next to a thread full of them. Refreshed only when a
  // genuinely new message lands, and never more than once every few seconds,
  // because a refresh on every poll would re-render the page for nothing.
  const lastRefresh = useRef(0);

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

  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!oldest || older.loading || !older.hasMore) return;
    setOlder((current) => ({ ...current, loading: true }));

    const node = scrollRef.current;
    const anchorHeight = node?.scrollHeight ?? 0;

    const result = await loadOlderMessagesAction({
      conversationId,
      before: oldest.id,
    });
    if (!result.ok) {
      setOlder({ hasMore: false, loading: false });
      setOlderError(result.error);
      return;
    }

    setMessages((current) => {
      const known = new Set(current.map((message) => message.id));
      const fresh = result.messages.filter((message) => !known.has(message.id));
      return fresh.length > 0 ? [...fresh, ...current] : current;
    });
    if (result.previews.length) {
      setPreviews((current) => {
        const next = new Map(current);
        for (const preview of result.previews) next.set(preview.url, preview);
        return next;
      });
    }
    setOlder({ hasMore: result.hasMore, loading: false });

    // Keep the reader where they were. Prepending rows moves everything down
    // by exactly the height that was added, so the scroll position is nudged
    // by the same amount — otherwise the thread jumps and they lose the line
    // they were reading.
    requestAnimationFrame(() => {
      const after = scrollRef.current;
      if (!after) return;
      after.scrollTop += after.scrollHeight - anchorHeight;
    });
  }, [conversationId, messages, older.hasMore, older.loading]);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stuckRef.current = distance < STICK_PX;
    if (stuckRef.current) setBehind(false);
    // Near the top: fetch the page above before they reach the end of it.
    if (node.scrollTop < 200) void loadOlder();
  }

  const poll = useCallback(async (): Promise<boolean> => {
    const since = cursorRef.current;
    const params = new URLSearchParams({ read: "1" });
    if (since) params.set("since", since);
    try {
      const response = await fetch(
        `/api/messages/${conversationId}/poll?${params.toString()}`,
        { cache: "no-store" },
      );
      // A 4xx means this thread is gone or forbidden; retrying will not fix
      // it, so it is reported as a success to stop the backoff spinning.
      if (!response.ok) return response.status >= 400 && response.status < 500;
      const data = (await response.json()) as {
        messages: ThreadMessage[];
        typing: string[];
        readReceipts: { name: string; lastReadAt: string | null }[];
        previews?: LinkPreview[];
      };
      setTyping(data.typing);
      setReceipts(data.readReceipts);
      const fresh = data.previews;
      if (fresh?.length) {
        setPreviews((current) => {
          const next = new Map(current);
          for (const preview of fresh) next.set(preview.url, preview);
          return next;
        });
      }
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

        const now = Date.now();
        if (now - lastRefresh.current > REFRESH_THROTTLE_MS) {
          lastRefresh.current = now;
          // The thread keeps its own state across this, because `useState`
          // only reads its initial value on mount.
          router.refresh();
        }
      }
      return true;
    } catch {
      // Reported rather than swallowed: one dropped poll is nothing, a run of
      // them is the difference between a live thread and a stale one, and the
      // stream is what decides when to say so.
      return false;
    }
  }, [conversationId, scrollToBottom, router]);

  const { state: streamState, refresh, markActive } = useMessageStream({ poll });

  function submit(body: string, imageUrl: string | null) {
    setError(null);
    markActive();

    // Generated once per composed message and reused on any retry, so the
    // server can recognise the second attempt as the same message rather than
    // writing it twice.
    const clientId = newClientId();
    const optimistic: ThreadMessage = {
      id: `pending-${clientId}`,
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
    data.set("clientId", clientId);
    if (imageUrl) data.set("imageUrl", imageUrl);

    startTransition(async () => {
      addPending(optimistic);
      stuckRef.current = true;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      const result = await sendMessageAction(data);
      if (!result.ok) {
        // Rolled back: the optimistic row goes with the transition, and what
        // was typed comes back to the composer rather than being lost.
        setError(result.error);
        setRestore({ token: Date.now(), body, imageUrl });
        return;
      }
      await refresh();
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
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <PaneHeader>
        <PaneBackLink />

        {others.length === 1 ? (
          <Link href={`/members/${others[0].handle}`} className="shrink-0 no-underline">
            <Avatar name={others[0].name} src={others[0].avatarUrl} size="sm" />
          </Link>
        ) : isGroup ? (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
            aria-hidden
          >
            <Users className="size-4" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title font-semibold text-foreground">{title}</h1>
          <p className="truncate text-caption text-foreground-muted" aria-live="polite">
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
      </PaneHeader>

      <StreamStatus state={streamState} />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {olderError ? (
          <p role="status" className="mb-3 text-center text-caption text-foreground-muted">
            {olderError}
          </p>
        ) : null}

        {older.hasMore && all.length > 0 ? (
          <div className="mb-3 flex justify-center">
            <Button
              size="sm"
              onClick={() => void loadOlder()}
              disabled={older.loading}
            >
              {older.loading ? "Loading…" : "Older messages"}
            </Button>
          </div>
        ) : null}

        {all.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<MessageSquare />}
            title="No messages yet."
            description="Say hello — a first message is usually about what you are cooking this week."
            className="mt-6"
          />
        ) : null}

        {groups.map((group) => (
          <div key={group.day}>
            <p className="sticky top-0 z-10 my-3 flex justify-center">
              <span className="rounded-full border border-border bg-surface/90 px-2.5 py-0.5 text-micro font-medium text-foreground-muted shadow-e1 backdrop-blur">
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
                    previews={previews}
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => scrollToBottom("smooth")}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 shadow-e2"
          >
            <ArrowDown className="size-3.5" aria-hidden />
            New messages
          </Button>
        </div>
      ) : null}

      {blockedOther ? (
        <p className="shrink-0 border-t border-border bg-surface px-4 py-3 text-center text-label text-foreground-muted">
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
