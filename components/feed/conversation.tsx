"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { CornerDownLeft, Link2, MessageSquare, Minus, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/content/rich-text";
import { Badge, Button, ButtonLink, Callout, EmptyState, fieldClass } from "@/components/app/ui";
import { VoteRail } from "@/components/feed/vote-rail";
import { formatShortTime } from "@/lib/community/format-count";
import {
  commentAnchorId,
  commentIdFromHash,
  pathToComment,
} from "@/lib/community/comment-anchor";
import type { DetailComment } from "@/lib/community/post-detail";
import { cn } from "@/lib/utils";

const MAX_INDENT = 4;
/** How long a linked comment stays highlighted. */
const HIGHLIGHT_MS = 2600;

type ThreadState = {
  collapsed: Set<string>;
  deeper: Set<string>;
  toggleCollapsed: (id: string) => void;
  showDeeper: (id: string) => void;
};

const ThreadContext = createContext<ThreadState | null>(null);

function useThread(): ThreadState {
  const state = useContext(ThreadContext);
  if (!state) throw new Error("Conversation nodes render inside <Conversation>.");
  return state;
}

/**
 * Post-page conversation with curved Reddit-style reply branches.
 *
 * Every comment carries `id="comment-<id>"` (C4), and a link to one lands on
 * it: the thread containing it is expanded, the page scrolls to it and it is
 * highlighted for a moment. When the comment is not on the page yet (a long
 * thread, a reply past the first page), the page asks the server for that
 * thread with `?comment=<id>` and tries again once it arrives.
 */
export function Conversation({
  comments,
  postId,
  focusRequested = null,
  moreHref = null,
}: {
  comments: DetailComment[];
  postId: string;
  /** Accepted for older callers; replies are written as the signed-in member. */
  viewer?: { name: string; avatar: string | null };
  /** The `?comment=` the server was asked for, if any. */
  focusRequested?: string | null;
  /** Where "show more replies" goes, when there are more roots. */
  moreHref?: string | null;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [deeper, setDeeper] = useState<Set<string>>(() => new Set());
  const [missing, setMissing] = useState(false);
  const handled = useRef<string | null>(null);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const showDeeper = useCallback((id: string) => {
    setDeeper((current) => new Set(current).add(id));
  }, []);

  /** Open the thread around a comment, then bring it into view. */
  const focus = useCallback(
    (id: string) => {
      const path = pathToComment(comments, id);
      if (!path) return false;
      flushSync(() => {
        setCollapsed((current) => {
          const next = new Set(current);
          for (const step of path) next.delete(step);
          return next;
        });
        setDeeper((current) => {
          const next = new Set(current);
          for (const step of path) next.add(step);
          return next;
        });
      });
      const element = document.getElementById(commentAnchorId(id));
      if (!element) return false;
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      element.tabIndex = -1;
      element.focus({ preventScroll: true });
      element.dataset.focused = "true";
      window.setTimeout(() => {
        delete element.dataset.focused;
      }, HIGHLIGHT_MS);
      return true;
    },
    [comments],
  );

  useEffect(() => {
    function run() {
      const id = commentIdFromHash(window.location.hash);
      if (!id || handled.current === id) return;
      if (focus(id)) {
        handled.current = id;
        setMissing(false);
        return;
      }
      if (focusRequested === id) {
        // The server was asked for this comment's thread and it is not there:
        // the comment has been removed. Say so rather than scrolling nowhere.
        handled.current = id;
        setMissing(true);
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set("comment", id);
      router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
    }
    // After paint, so the comments are in the document to scroll to.
    const frame = window.requestAnimationFrame(run);
    window.addEventListener("hashchange", run);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", run);
    };
  }, [focus, focusRequested, router]);

  // No surface of its own: the post page sets the thread in the same card as
  // the reply box and the sort, so it reads as one conversation.
  if (comments.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {missing ? <MissingNotice /> : null}
        <EmptyState
          size="sm"
          bordered={false}
          icon={<MessageSquare />}
          title="No replies yet"
          description="Say the first thing — a question counts."
        />
      </div>
    );
  }

  return (
    <ThreadContext.Provider value={{ collapsed, deeper, toggleCollapsed, showDeeper }}>
      <div className="flex flex-col gap-5">
        {missing ? <MissingNotice /> : null}
        <ul className="space-y-5">
          {comments.map((comment) => (
            <li key={comment.id}>
              <Node comment={comment} postId={postId} depth={0} />
            </li>
          ))}
        </ul>
        {moreHref ? (
          <ButtonLink href={moreHref} size="sm" scroll={false} className="self-center">
            Show more replies
          </ButtonLink>
        ) : null}
      </div>
    </ThreadContext.Provider>
  );
}

function MissingNotice() {
  return (
    <Callout tone="neutral">
      The comment you followed has been removed. The rest of the conversation is below.
    </Callout>
  );
}

function Node({
  comment,
  postId,
  depth,
}: {
  comment: DetailComment;
  postId: string;
  depth: number;
}) {
  const thread = useThread();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyFailed, setReplyFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const name = comment.author.profile?.displayName ?? comment.author.handle;
  const hidden = countDescendants(comment);
  const isHost = comment.author.handle === "adam";
  const atLimit = depth >= MAX_INDENT;
  const hasReplies = comment.replies.length > 0;
  const collapsed = thread.collapsed.has(comment.id);

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setReplyFailed(null);
    start(async () => {
      try {
        const response = await fetch(`/api/community/posts/${postId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, parentId: comment.id }),
        });
        if (!response.ok) {
          // The reply stays in the box, so saying so is all it takes to retry.
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setReplyFailed(payload?.error ?? "That reply did not post. Try again.");
          return;
        }
        form.reset();
        setReplyOpen(false);
        router.refresh();
      } catch {
        setReplyFailed("That reply did not post. Check your connection and try again.");
      }
    });
  }

  return (
    // The anchor is on the wrapper, so it exists even while the thread is
    // collapsed and a link can always find it.
    <div
      id={commentAnchorId(comment.id)}
      className="relative scroll-mt-24 rounded-ctl outline-none transition-colors data-[focused=true]:bg-brand-wash/60"
    >
      {collapsed ? (
        <div className="flex items-center gap-2.5 py-1">
          <button
            type="button"
            onClick={() => thread.toggleCollapsed(comment.id)}
            aria-label={`Expand ${name}'s thread`}
            aria-expanded={false}
            className="grid size-6 shrink-0 place-items-center rounded-full border border-hairline-firm bg-surface text-foreground-muted transition hover:border-brand hover:text-brand"
          >
            <Plus className="size-3" aria-hidden />
          </button>
          <p className="min-w-0 truncate text-label text-foreground-muted">
            <span className="font-medium text-foreground">{name}</span>
            {hidden > 0 ? ` · ${hidden} more` : ""}
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2.5">
            <div className="relative flex w-8 shrink-0 flex-col items-center">
              <Avatar
                name={name}
                src={comment.author.profile?.avatarUrl}
                size="sm"
                className="relative z-1 size-8 text-micro"
              />
              {hasReplies ? (
                <button
                  type="button"
                  onClick={() => thread.toggleCollapsed(comment.id)}
                  aria-label={`Collapse ${name}'s thread`}
                  aria-expanded
                  className="mt-1 grid size-5 place-items-center rounded-full border border-hairline-firm bg-surface text-foreground-muted transition hover:border-brand hover:text-brand"
                >
                  <Minus className="size-3" aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 pb-0.5">
              <p className="flex flex-wrap items-center gap-x-1.5 text-caption leading-tight text-foreground-muted">
                <Link
                  href={`/members/${comment.author.handle}`}
                  className="text-label font-semibold text-foreground no-underline hover:underline"
                >
                  {name}
                </Link>
                {isHost ? <Badge tone="brand">Host</Badge> : null}
                <span>· {formatShortTime(new Date(comment.createdAt))}</span>
              </p>

              <RichText
                body={comment.body}
                className="mt-1 text-body leading-relaxed text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
              />

              <div className="mt-1 flex items-center gap-0.5">
                <VoteRail
                  commentId={comment.id}
                  returnToPostId={comment.postId}
                  score={comment.score}
                  myVote={comment.myVote}
                  layout="row"
                />
                <button
                  type="button"
                  onClick={() => setReplyOpen((open) => !open)}
                  aria-expanded={replyOpen}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-ctl px-2 text-caption font-medium transition",
                    replyOpen
                      ? "bg-brand-wash text-on-brand-wash"
                      : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  <CornerDownLeft className="size-3.5" aria-hidden />
                  Reply
                </button>
                <a
                  href={`/posts/${comment.postId}#${commentAnchorId(comment.id)}`}
                  title="Link to this reply"
                  className="inline-flex size-7 items-center justify-center rounded-ctl text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground"
                >
                  <Link2 className="size-3.5" aria-hidden />
                  <span className="sr-only">Link to this reply</span>
                </a>
              </div>

              {replyOpen ? (
                <form onSubmit={submitReply} className="mt-2 flex gap-2">
                  <input
                    name="body"
                    required
                    autoFocus
                    maxLength={5000}
                    placeholder={`Reply to ${name}…`}
                    aria-label={`Reply to ${name}`}
                    aria-invalid={replyFailed ? true : undefined}
                    disabled={pending}
                    className={fieldClass({ size: "sm", className: "flex-1" })}
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={pending}>
                    {pending ? "Posting…" : "Reply"}
                  </Button>
                </form>
              ) : null}
              {replyOpen && replyFailed ? (
                <p role="alert" className="mt-1.5 text-caption font-medium text-danger">
                  {replyFailed}
                </p>
              ) : null}
            </div>
          </div>

          {hasReplies ? (
            atLimit && !thread.deeper.has(comment.id) ? (
              <button
                type="button"
                onClick={() => thread.showDeeper(comment.id)}
                className="ml-10 mt-2 rounded-chip text-label font-medium text-link transition hover:underline"
              >
                Continue this thread ({hidden} more)
              </button>
            ) : (
              <ul className="vu-thread-replies">
                {comment.replies.map((reply, index) => {
                  const last = index === comment.replies.length - 1;
                  return (
                    <li key={reply.id} className={cn("vu-thread-node", last && "is-last")}>
                      <span className="vu-thread-curve" aria-hidden />
                      {!last ? <span className="vu-thread-spine" aria-hidden /> : null}
                      <Node
                        comment={reply}
                        postId={postId}
                        depth={atLimit ? 0 : depth + 1}
                      />
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </>
      )}
    </div>
  );
}

function countDescendants(comment: DetailComment): number {
  return comment.replies.reduce((sum, reply) => sum + 1 + countDescendants(reply), 0);
}
