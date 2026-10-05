"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, fieldClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * The top-level reply box on a post page.
 *
 * Posts through the same JSON route the inline panel and the thread replies use,
 * then refreshes — so a new reply lands in the correct place for the current
 * sort rather than being appended wherever it was typed.
 *
 * It grows on focus like the post composer does. Someone who is not in the room
 * gets told so instead of being given a box that will refuse them.
 */
export function CommentComposer({
  postId,
  viewer,
  joined,
}: {
  postId: string;
  viewer: { name: string; avatar: string | null };
  joined: boolean;
}) {
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const text = body.trim();

  // No surface of its own: the post page sets the reply box, the sort and the
  // thread in one card.
  if (!joined) {
    return (
      <p className="flex items-center gap-2 text-body text-foreground-muted">
        <Lock className="size-4 shrink-0" aria-hidden />
        Join this room to reply.
      </p>
    );
  }

  function submit() {
    if (!text || pending) return;
    start(async () => {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? "That reply did not post.");
        return;
      }
      setBody("");
      setError(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section>
      <div className="flex gap-3">
        <Avatar name={viewer.name} src={viewer.avatar} size="sm" />
        <div className="min-w-0 flex-1">
          <textarea
            value={body}
            rows={open ? 3 : 1}
            disabled={pending}
            aria-label="Write a reply"
            aria-invalid={error ? true : undefined}
            placeholder="Add your reply…"
            onFocus={() => setOpen(true)}
            onChange={(event) => setBody(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className={cn(
              open
                ? fieldClass({ multiline: true })
                : fieldClass({ className: "py-2 leading-5" }),
              "block resize-none",
            )}
          />

          {error ? (
            <p className="mt-1.5 text-caption font-medium text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {open ? (
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setBody("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={!text || pending}
                className="min-w-16"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Posting
                  </>
                ) : (
                  "Reply"
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
