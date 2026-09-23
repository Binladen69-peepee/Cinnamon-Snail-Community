"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { CornerDownLeft, Link2, MessageSquare, Minus, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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
  if (comments.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface px-6 py-8 text-center">
        <MessageSquare className="mx-auto size-5 text-foreground-muted" aria-hidden />
        <p className="mt-2.5 text-[14.5px] text-foreground">No replies yet</p>
        <p className="mt-1 text-[13px] text-foreground-muted">
          Say the first thing — a question counts.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-3 sm:p-4">
      <ul className="space-y-4">
        {comments.map((comment) => (
          <li key={comment.id}>
            <Node comment={comment} postId={postId} viewer={viewer} depth={0} />
          </li>
        ))}
      </ul>
    </div>
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
    start(async () => {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: comment.id }),
      });
      if (!response.ok) return;
      form.reset();
      setReplyOpen(false);
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={`Expand ${name}'s thread`}
          className="grid size-5 shrink-0 place-items-center rounded-full border border-border text-foreground-muted transition hover:border-brand hover:text-brand"
        >
          <Plus className="size-3" aria-hidden />
        </button>
        <p className="min-w-0 truncate text-[12.5px] text-foreground-muted">
          <span className="text-foreground">{name}</span>
          {hidden > 0 ? ` · ${hidden} more` : ""}
        </p>
      </div>
    );
  }

  return (
    <div id={`comment-${comment.id}`} className="relative">
      <div className="flex gap-2.5">
        <div className="relative flex w-8 shrink-0 flex-col items-center">
          <Avatar
            name={name}
            src={comment.author.profile?.avatarUrl}
            size="sm"
            className="relative z-[1] size-8 text-[10px]"
          />
          {hasReplies ? (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label={`Collapse ${name}'s thread`}
              className="mt-1 grid size-4 place-items-center rounded-full border border-border bg-background text-foreground-muted transition hover:border-brand hover:text-brand"
            >
              <Minus className="size-2.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 pb-0.5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-tight">
            <Link
              href={`/members/${comment.author.handle}`}
              className="font-semibold text-foreground no-underline hover:underline"
            >
              {name}
            </Link>
            {isHost ? (
              <span className="rounded-full bg-brand-wash px-1.5 text-[9.5px] uppercase tracking-[0.08em] text-brand-strong">
                Host
              </span>
            ) : null}
            <span className="text-foreground-muted">
              · {formatShortTime(new Date(comment.createdAt))}
            </span>
          </p>

          <div
            className="prose-vu mt-1 text-[14px] leading-[1.5] text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: comment.bodyHtml || comment.plainText }}
          />

          <div className="mt-0.5 flex items-center gap-0.5">
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
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] transition",
                replyOpen
                  ? "bg-brand-wash text-brand"
                  : "text-foreground-muted hover:bg-mint hover:text-foreground",
              )}
            >
              <CornerDownLeft className="size-3" aria-hidden />
              Reply
            </button>
            <a
              href={`/posts/${comment.postId}#comment-${comment.id}`}
              title="Link to this reply"
              className="inline-flex size-7 items-center justify-center rounded-full text-foreground-muted no-underline transition hover:bg-mint hover:text-foreground"
            >
              <Link2 className="size-3" aria-hidden />
              <span className="sr-only">Link to this reply</span>
            </a>
          </div>

          {replyOpen ? (
            <form onSubmit={submitReply} className="mt-1.5 flex gap-1.5">
              <input
                name="body"
                required
                autoFocus
                placeholder={`Reply to ${name}…`}
                disabled={pending}
                className="h-8 min-w-0 flex-1 rounded-[12px] border border-border bg-mint/40 px-3 text-[13.5px] text-foreground outline-none transition focus:border-brand focus:bg-surface disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-8 shrink-0 items-center rounded-[12px] bg-brand-fill px-3 text-[12.5px] text-brand-fill-foreground transition hover:bg-brand-fill-hover disabled:opacity-50 "
              >
                {pending ? "Posting…" : "Reply"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {hasReplies ? (
        atLimit && !showDeeper ? (
          <button
            type="button"
            onClick={() => setShowDeeper(true)}
            className="mt-1.5 ml-10 text-[12.5px] text-brand transition hover:underline"
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
