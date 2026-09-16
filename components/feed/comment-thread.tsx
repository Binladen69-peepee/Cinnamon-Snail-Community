"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Minus, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { VoteRail } from "@/components/feed/vote-rail";
import { formatShortTime } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

export type ThreadComment = {
  id: string;
  postId: string;
  parentId: string | null;
  bodyHtml: string | null;
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
 */
export function CommentThread({
  comment,
  onPosted,
  depth = 0,
}: {
  comment: ThreadComment;
  onPosted?: () => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
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
    try {
      const response = await fetch(`/api/community/posts/${comment.postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: comment.id }),
      });
      if (!response.ok) return;
      form.reset();
      setReplyOpen(false);
      if (onPosted) onPosted();
      else router.refresh();
    } finally {
      setReplyPending(false);
    }
  }

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand thread"
          className="grid size-5 shrink-0 place-items-center rounded-full border border-border text-foreground-muted transition hover:border-brand hover:text-brand"
        >
          <Plus className="size-3" aria-hidden />
        </button>
        <p className="truncate text-[13px] text-foreground-muted">
          <span className="text-foreground">{name}</span>
          {hidden > 0 ? ` · ${hidden} more` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
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
              title="Collapse thread"
              className="group/collapse mt-1 grid size-4 place-items-center rounded-full border border-border bg-background text-foreground-muted transition hover:border-brand hover:text-brand"
            >
              <Minus className="size-2.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-tight">
            <span className="font-semibold text-foreground">{name}</span>
            {isHost ? (
              <span className="rounded-full bg-brand-wash px-1.5 py-px text-[10px] uppercase tracking-[0.08em] text-brand-strong">
                Host
              </span>
            ) : null}
            <span className="text-foreground-muted">
              · {formatShortTime(new Date(comment.createdAt))}
            </span>
          </p>

          <div
            className="prose-vu mt-1 text-[14.5px] leading-[1.55] text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: comment.bodyHtml || comment.plainText }}
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
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] transition",
                replyOpen
                  ? "bg-brand-wash text-brand"
                  : "text-foreground-muted hover:bg-mint hover:text-foreground",
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
                placeholder={`Reply to ${name}…`}
                disabled={replyPending}
                className="h-9 min-w-0 flex-1 rounded-[12px] border border-border bg-mint/40 px-3.5 text-[14px] text-foreground outline-none transition focus:border-brand focus:bg-surface disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={replyPending}
                className="inline-flex h-9 shrink-0 items-center rounded-[12px] bg-forest px-3.5 text-[13px] text-paper transition hover:bg-deep-forest disabled:opacity-50 dark:bg-[#fff8ef] dark:text-[#0f3d32]"
              >
                {replyPending ? "Posting…" : "Reply"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {hasReplies && depth < MAX_INDENT ? (
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
                <CommentThread
                  comment={reply}
                  onPosted={onPosted}
                  depth={depth + 1}
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
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function countDescendants(comment: ThreadComment): number {
  return comment.replies.reduce((sum, reply) => sum + 1 + countDescendants(reply), 0);
}
