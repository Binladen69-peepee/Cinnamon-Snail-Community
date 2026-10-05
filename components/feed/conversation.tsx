"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { CornerDownLeft, Link2, MessageSquare, Minus, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Button, EmptyState, fieldClass } from "@/components/app/ui";
import { VoteRail } from "@/components/feed/vote-rail";
import { formatShortTime } from "@/lib/community/format-count";
import type { DetailComment } from "@/lib/community/post-detail";
import { cn } from "@/lib/utils";

const MAX_INDENT = 4;

/**
 * Post-page conversation with curved Reddit-style reply branches.
 */
export function Conversation({
  comments,
  postId,
  viewer,
}: {
  comments: DetailComment[];
  postId: string;
  viewer: { name: string; avatar: string | null };
}) {
  // No surface of its own: the post page sets the thread in the same card as
  // the reply box and the sort, so it reads as one conversation.
  if (comments.length === 0) {
    return (
      <EmptyState
        size="sm"
        bordered={false}
        icon={<MessageSquare />}
        title="No replies yet"
        description="Say the first thing — a question counts."
      />
    );
  }

  return (
    <ul className="space-y-5">
      {comments.map((comment) => (
        <li key={comment.id}>
          <Node comment={comment} postId={postId} viewer={viewer} depth={0} />
        </li>
      ))}
    </ul>
  );
}

function Node({
  comment,
  postId,
  viewer,
  depth,
}: {
  comment: DetailComment;
  postId: string;
  viewer: { name: string; avatar: string | null };
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyFailed, setReplyFailed] = useState(false);
  const [showDeeper, setShowDeeper] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const name = comment.author.profile?.displayName ?? comment.author.handle;
  const hidden = countDescendants(comment);
  const isHost = comment.author.handle === "adam";
  const atLimit = depth >= MAX_INDENT;
  const hasReplies = comment.replies.length > 0;

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setReplyFailed(false);
    start(async () => {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: comment.id }),
      });
      if (!response.ok) {
        // The reply stays in the box, so saying so is all it takes to retry.
        setReplyFailed(true);
        return;
      }
      form.reset();
      setReplyOpen(false);
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={`Expand ${name}'s thread`}
          className="grid size-6 shrink-0 place-items-center rounded-full border border-hairline-firm bg-surface text-foreground-muted transition hover:border-brand hover:text-brand"
        >
          <Plus className="size-3" aria-hidden />
        </button>
        <p className="min-w-0 truncate text-label text-foreground-muted">
          <span className="font-medium text-foreground">{name}</span>
          {hidden > 0 ? ` · ${hidden} more` : ""}
        </p>
      </div>
    );
  }

  return (
    <div id={`comment-${comment.id}`} className="relative scroll-mt-20">
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

          <div
            className="prose-vu mt-1 text-body leading-relaxed text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: comment.bodyHtml || comment.plainText }}
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
              href={`/posts/${comment.postId}#comment-${comment.id}`}
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
                placeholder={`Reply to ${name}…`}
                aria-label={`Reply to ${name}`}
                aria-invalid={replyFailed || undefined}
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
              That reply did not post. Try again.
            </p>
          ) : null}
        </div>
      </div>

      {hasReplies ? (
        atLimit && !showDeeper ? (
          <button
            type="button"
            onClick={() => setShowDeeper(true)}
            className="ml-10 mt-2 rounded-chip text-label font-medium text-link transition hover:underline"
          >
            Continue this thread ({hidden} more)
          </button>
        ) : (
          <ul className="vu-thread-replies">
            {comment.replies.map((reply, index) => {
              const last = index === comment.replies.length - 1;
              return (
                <li
                  key={reply.id}
                  className={cn("vu-thread-node", last && "is-last")}
                >
                  <span className="vu-thread-curve" aria-hidden />
                  {!last ? <span className="vu-thread-spine" aria-hidden /> : null}
                  <Node
                    comment={reply}
                    postId={postId}
                    viewer={viewer}
                    depth={atLimit ? 0 : depth + 1}
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

function countDescendants(comment: DetailComment): number {
  return comment.replies.reduce(
    (sum, reply) => sum + 1 + countDescendants(reply),
    0,
  );
}
