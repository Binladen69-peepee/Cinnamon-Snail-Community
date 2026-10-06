"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CornerDownLeft, Minus, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/content/rich-text";
import { Badge, Button, fieldClass } from "@/components/app/ui";
import { VoteRail } from "@/components/feed/vote-rail";
import { formatShortTime } from "@/lib/community/format-count";
import { commentAnchorId } from "@/lib/community/comment-anchor";
import { cn } from "@/lib/utils";

export type ThreadComment = {
  id: string;
  postId: string;
  parentId: string | null;
  /** The stored markdown, rendered through `<RichText>` (C2). */
  body: string;
  bodyHtml?: string | null;
  plainText: string;
  score: number;
  createdAt: Date | string;
  myVote: number;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  replies: ThreadComment[];
};

const MAX_INDENT = 5;

/**
 * Reddit-style thread: thin vertical spine with a curved L-branch into each
 * child avatar (not a straight border-l bar).
 *
 * Each comment carries `id="comment-<id>"` so a link can land on it (C4). The
 * lightbox shows the same thread as the card it opened from, so it passes
 * `anchor={false}`: two elements with one id would send the link to whichever
 * came first.
 */
export function CommentThread({
  comment,
  onPosted,
  depth = 0,
  anchor = true,
}: {
  comment: ThreadComment;
  onPosted?: () => void;
  depth?: number;
  anchor?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [replyFailed, setReplyFailed] = useState<string | null>(null);
  const router = useRouter();
  const name = comment.author.profile?.displayName ?? comment.author.handle;
  const hidden = countDescendants(comment);
  const isHost = comment.author.handle === "adam";
  const hasReplies = comment.replies.length > 0;

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setReplyPending(true);
    setReplyFailed(null);
    try {
      const response = await fetch(`/api/community/posts/${comment.postId}/comments`, {
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
      if (onPosted) onPosted();
      else router.refresh();
    } catch {
      setReplyFailed("That reply did not post. Check your connection and try again.");
    } finally {
      setReplyPending(false);
    }
  }

  return (
    <div
      id={anchor ? commentAnchorId(comment.id) : undefined}
      className="relative scroll-mt-24 rounded-ctl transition-colors data-[focused=true]:bg-brand-wash/60"
    >
      {collapsed ? (
        <div className="flex items-center gap-2.5 py-1">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label={`Expand ${name}'s thread`}
            className="grid size-6 shrink-0 place-items-center rounded-full border border-hairline-firm bg-surface text-foreground-muted transition hover:border-brand hover:text-brand"
          >
            <Plus className="size-3" aria-hidden />
          </button>
          <p className="truncate text-label text-foreground-muted">
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
                  onClick={() => setCollapsed(true)}
                  aria-label={`Collapse ${name}'s thread`}
                  title="Collapse thread"
                  className="mt-1 grid size-5 place-items-center rounded-full border border-hairline-firm bg-surface text-foreground-muted transition hover:border-brand hover:text-brand"
                >
                  <Minus className="size-3" aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 pb-1">
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
                body={comment.body ?? comment.plainText}
                className="mt-1 text-body leading-relaxed text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
              />

              <div className="mt-1 flex items-center gap-1">
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
                    disabled={replyPending}
                    className={fieldClass({ size: "sm", className: "flex-1" })}
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={replyPending}>
                    {replyPending ? "Posting…" : "Reply"}
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

          {hasReplies && depth < MAX_INDENT ? (
            <ul className="vu-thread-replies">
              {comment.replies.map((reply, index) => {
                const last = index === comment.replies.length - 1;
                return (
                  <li key={reply.id} className={cn("vu-thread-node", last && "is-last")}>
                    <span className="vu-thread-curve" aria-hidden />
                    {!last ? <span className="vu-thread-spine" aria-hidden /> : null}
                    <CommentThread
                      comment={reply}
                      onPosted={onPosted}
                      depth={depth + 1}
                      anchor={anchor}
                    />
                  </li>
                );
              })}
            </ul>
          ) : hasReplies ? (
            <div className="mt-2 space-y-3 pl-2">
              {comment.replies.map((reply) => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  onPosted={onPosted}
                  depth={0}
                  anchor={anchor}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function countDescendants(comment: ThreadComment): number {
  return comment.replies.reduce((sum, reply) => sum + 1 + countDescendants(reply), 0);
}
