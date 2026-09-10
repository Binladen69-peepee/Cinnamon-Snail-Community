"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { CornerDownLeft } from "lucide-react";
import { CommentThread, type ThreadComment } from "@/components/community/comment-thread";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

const OPEN_KEY = "vu-open-comments";

/**
 * The comment panel for a feed post.
 *
 * Split out of the old InlineComments, which rendered its own trigger button in
 * the middle of the action bar. The bar owns the trigger now and this is just
 * the panel, so the actions read as one group.
 *
 * Comments load on first open and the composer posts through the existing JSON
 * route, so a new comment appears without re-rendering the feed.
 */
export function CommentPanel({
  postId,
  open,
  viewer,
  onCountChange,
}: {
  postId: string;
  open: boolean;
  viewer: { name: string; avatar: string | null };
  onCountChange?: (count: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [pending, startTransition] = useTransition();

  /** Re-read the thread after a reply. Called from handlers, never an effect. */
  async function load() {
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`);
      if (!response.ok) throw new Error("Could not load comments.");
      const data = (await response.json()) as {
        comments: ThreadComment[];
        count: number;
      };
      setComments(data.comments);
      onCountChange?.(data.count);
    } catch {
      setError("Could not load comments.");
    }
  }

  // Fetch on first open, and remember which post was open across a navigation
  // so returning from a post page does not collapse it.
  //
  // Written as a promise chain rather than calling an async helper, so state is
  // only ever set from a callback — setting it synchronously in an effect body
  // cascades a render. The `alive` flag drops a response that arrives after the
  // panel has closed or moved to another post.
  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem(OPEN_KEY, postId);
    } catch {
      // Private mode; remembering is a convenience, not a requirement.
    }
    if (comments !== null) return;

    let alive = true;
    fetch(`/api/community/posts/${postId}/comments`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("load")),
      )
      .then((data: { comments: ThreadComment[]; count: number }) => {
        if (!alive) return;
        setComments(data.comments);
        onCountChange?.(data.count);
      })
      .catch(() => {
        if (alive) setError("Could not load comments.");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

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
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        setError("Could not post that comment.");
        return;
      }
      const payload = (await response.json()) as {
        comments: ThreadComment[];
        count: number;
      };
      form.reset();
      setComments(payload.comments);
      onCountChange?.(payload.count);
    });
  }

  if (!open) return null;

  return (
    <div className="mt-4 space-y-4 border-t border-sand/70 pt-4">
      <form onSubmit={onSubmit} className="flex items-start gap-2.5">
        <Avatar name={viewer.name} src={viewer.avatar} size="sm" />
        <div className="relative min-w-0 flex-1">
          <input
            name="body"
            required
            placeholder="Add a comment…"
            disabled={pending}
            className="h-11 w-full rounded-full border border-sand bg-mint/50 pl-4 pr-24 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-accent focus:bg-surface disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending}
            className="absolute right-1 top-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-forest px-3.5 text-xs font-semibold text-paper transition hover:bg-deep-forest disabled:opacity-60 dark:bg-surface dark:text-foreground dark:ring-1 dark:ring-border"
          >
            {pending ? "Posting…" : "Post"}
            <CornerDownLeft className="size-3.5" aria-hidden />
          </button>
        </div>
      </form>

      {comments === null && !error ? (
        <div className="space-y-3" aria-busy>
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-2.5">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading comments</span>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {comments?.length === 0 ? (
        <p className="py-2 text-sm text-foreground-muted">
          No comments yet — say the first thing.
        </p>
      ) : null}

      {comments
        ? comments.map((comment) => (
            <CommentThread key={comment.id} comment={comment} onPosted={load} />
          ))
        : null}
    </div>
  );
}
