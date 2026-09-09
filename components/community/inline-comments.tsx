"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { MessageSquare } from "lucide-react";
import { CommentThread, type ThreadComment } from "@/components/community/comment-thread";

const OPEN_KEY = "vu-open-comments";

export function InlineComments({
  postId,
  commentCount,
}: {
  postId: string;
  commentCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [count, setCount] = useState(commentCount);
  const [pending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`);
      if (!response.ok) throw new Error("Could not load comments.");
      const data = (await response.json()) as { comments: ThreadComment[]; count: number };
      setComments(data.comments);
      setCount(data.count);
    } catch {
      setError("Could not load comments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem(OPEN_KEY) === postId) {
        setOpen(true);
        void load();
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (typeof window !== "undefined") {
      if (next) sessionStorage.setItem(OPEN_KEY, postId);
      else if (sessionStorage.getItem(OPEN_KEY) === postId) sessionStorage.removeItem(OPEN_KEY);
    }
    if (next && comments === null) void load();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    startTransition(async () => {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: formData.get("parentId") || undefined }),
      });
      if (!response.ok) {
        setError("Could not post that comment.");
        return;
      }
      const payload = (await response.json()) as { comments: ThreadComment[]; count: number };
      form.reset();
      setComments(payload.comments);
      setCount(payload.count);
    });
  }

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground-muted hover:bg-mint"
        aria-expanded={open}
      >
        <MessageSquare className="size-3.5" aria-hidden />
        {count}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <form onSubmit={onSubmit} className="flex gap-2">
            <input type="hidden" name="postId" value={postId} />
            <input
              name="body"
              required
              placeholder="Write a comment"
              className="h-9 min-w-0 flex-1 border border-border bg-background px-3 text-sm"
              style={{ borderRadius: 12 }}
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending}
              className="h-9 bg-foreground px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ borderRadius: 12 }}
            >
              {pending ? "Posting…" : "Comment"}
            </button>
          </form>
          {loading && !comments ? <CommentSkeleton /> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {!loading && comments?.length === 0 ? (
            <p className="text-sm text-foreground-muted">No comments yet. Be the first.</p>
          ) : null}
          {!loading && comments
            ? comments.map((comment) => (
                <CommentThread key={comment.id} comment={comment} onPosted={load} />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1].map((item) => (
        <div key={item} className="h-16 animate-pulse bg-background" style={{ borderRadius: 12 }} />
      ))}
      <span className="sr-only">Loading comments</span>
    </div>
  );
}
