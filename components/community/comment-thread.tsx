"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { VoteRail } from "@/components/community/vote-rail";
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

/** Past this depth the indent would eat the text column on a phone. */
const MAX_INDENT = 5;

/**
 * A threaded comment, Reddit-style.
 *
 * Each reply used to be its own bordered card, which meant a four-deep thread
 * rendered four nested boxes and the text column shrank to nothing. Nesting is
 * carried by a single hairline thread line instead — the line is also the
 * collapse target, which is how Reddit does it and is a much larger hit area
 * than the old toggle.
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
          className="grid size-6 shrink-0 place-items-center rounded-chip border border-border text-foreground-muted transition hover:border-brand hover:text-brand"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
        <p className="truncate text-[13px] text-foreground-muted">
          <span className="font-bold text-foreground">{name}</span>
          {hidden > 0 ? ` and ${hidden} more ${hidden === 1 ? "reply" : "replies"}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* The thread line. Clicking it collapses the branch. */}
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label={`Collapse ${name}'s thread`}
        className="group/line relative flex w-5 shrink-0 justify-center"
      >
        <Avatar
          name={name}
          src={comment.author.profile?.avatarUrl}
          size="sm"
          className="absolute top-0 size-6 text-[10px]"
        />
        <span
          aria-hidden
          className="mt-7 w-px flex-1 rounded-full bg-border transition-colors group-hover/line:bg-brand"
        />
      </button>

      <div className="min-w-0 flex-1 pb-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-tight">
          <span className="font-bold text-foreground">{name}</span>
          {isHost ? (
            <span className="rounded-full bg-brand-wash px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em] text-brand-strong">
              Host
            </span>
          ) : null}
          <span className="text-foreground-muted">
            {formatShortTime(new Date(comment.createdAt))}
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
            orientation="horizontal"
          />
          <button
            type="button"
            onClick={() => setReplyOpen((open) => !open)}
            aria-expanded={replyOpen}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold transition",
              replyOpen
                ? "bg-brand-wash text-brand"
                : "text-foreground-muted hover:bg-brand-wash hover:text-brand",
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
              className="h-9 min-w-0 flex-1 rounded-full border border-border bg-mint/40 px-3.5 text-[14px] text-foreground outline-none transition focus:border-brand focus:bg-surface disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={replyPending}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-forest px-3.5 text-[13px] font-bold text-paper transition hover:bg-deep-forest disabled:opacity-50 dark:bg-brand dark:text-[#06120d]"
            >
              {replyPending ? "Posting…" : "Reply"}
            </button>
          </form>
        ) : null}

        {comment.replies.length > 0 ? (
          <div
            className={cn(
              "mt-2 space-y-2",
              // Stop indenting once it would squeeze the text; deeper replies
              // still read in order, they just stop stepping right.
              depth < MAX_INDENT ? "pl-1" : "pl-0",
            )}
          >
            {comment.replies.map((reply) => (
              <CommentThread
                key={reply.id}
                comment={reply}
                onPosted={onPosted}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function countDescendants(comment: ThreadComment): number {
  return comment.replies.reduce((sum, reply) => sum + 1 + countDescendants(reply), 0);
}
