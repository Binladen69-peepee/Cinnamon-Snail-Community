"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MinusSquare, PlusSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { VoteButtons } from "@/components/community/vote-buttons";
import { formatRelativeTime } from "@/lib/utils";

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

export function CommentThread({
  comment,
  onPosted,
}: {
  comment: ThreadComment;
  onPosted?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const router = useRouter();
  const name = comment.author.profile?.displayName ?? comment.author.handle;
  const childCount = countDescendants(comment);

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

  return (
    <article className="vu-card">
      <div className="flex gap-1 p-3 sm:gap-2 sm:p-4">
        {collapsed ? (
          <button
            type="button"
            className="mt-1 inline-flex size-8 items-center justify-center text-foreground-muted"
            aria-label="Expand thread"
            onClick={() => setCollapsed(false)}
          >
            <PlusSquare className="size-4" />
          </button>
        ) : (
          <VoteButtons
            commentId={comment.id}
            returnToPostId={comment.postId}
            score={comment.score}
            myVote={comment.myVote}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={name} src={comment.author.profile?.avatarUrl} size="sm" />
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="text-xs text-foreground-muted">{formatRelativeTime(comment.createdAt)}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted hover:text-foreground"
              onClick={() => setCollapsed((open) => !open)}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <>
                  <ChevronRight className="size-3.5" />
                  {childCount + 1} collapsed
                </>
              ) : (
                <>
                  <MinusSquare className="size-3.5" />
                  Collapse
                </>
              )}
            </button>
          </div>
          {collapsed ? null : (
            <>
              <div
                className="mt-2 text-sm leading-relaxed text-foreground [&_p]:mb-2"
                dangerouslySetInnerHTML={{
                  __html: comment.bodyHtml || comment.plainText,
                }}
              />
              <div className="mt-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-foreground-muted hover:text-accent"
                  onClick={() => setReplyOpen((open) => !open)}
                >
                  Reply
                </button>
              </div>
              {replyOpen ? (
                <form onSubmit={submitReply} className="mt-3 flex gap-2">
                  <input
                    name="body"
                    required
                    placeholder="Reply in thread"
                    className="h-9 flex-1 border border-border bg-background px-3 text-sm"
                    style={{ borderRadius: 12 }}
                    disabled={replyPending}
                  />
                  <button
                    type="submit"
                    disabled={replyPending}
                    className="h-9 bg-foreground px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    style={{ borderRadius: 12 }}
                  >
                    {replyPending ? "Posting…" : "Reply"}
                  </button>
                </form>
              ) : null}
              {comment.replies.length > 0 ? (
                <div className="mt-4 space-y-3 border-l border-border pl-3 sm:pl-4">
                  {comment.replies.map((reply) => (
                    <CommentThread key={reply.id} comment={reply} onPosted={onPosted} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function countDescendants(comment: ThreadComment): number {
  return comment.replies.reduce(
    (sum, reply) => sum + 1 + countDescendants(reply),
    0,
  );
}
