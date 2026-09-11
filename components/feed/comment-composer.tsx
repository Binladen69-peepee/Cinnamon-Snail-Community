"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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

  if (!joined) {
    return (
      <p className="rounded-card border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground-muted">
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
    <section
      className={cn(
        "rounded-card border bg-surface p-2.5 transition-colors",
        open ? "border-brand/50" : "border-border",
      )}
    >
      <div className="flex gap-2.5">
        <Avatar name={viewer.name} src={viewer.avatar} size="sm" />
        <div className="min-w-0 flex-1">
          <textarea
            value={body}
            rows={open ? 3 : 1}
            disabled={pending}
            aria-label="Write a reply"
            placeholder="Add your reply…"
            onFocus={() => setOpen(true)}
            onChange={(event) => setBody(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none border-0 bg-transparent p-0 pt-1 text-[14.5px] leading-normal text-foreground outline-none placeholder:text-foreground-muted disabled:opacity-60"
          />

          {error ? (
            <p className="mt-1.5 text-[12.5px] font-semibold text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {open ? (
            <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setBody("");
                  setError(null);
                }}
                className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-bold text-foreground-muted transition hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!text || pending}
                className="inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-full bg-forest px-3.5 text-[12.5px] font-bold text-paper transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-deep-forest dark:bg-brand dark:text-[#06120d] dark:hover:bg-brand-strong"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Posting
                  </>
                ) : (
                  "Reply"
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
