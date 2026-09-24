"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { CommentPanel } from "@/components/feed/comment-panel";
import { startLessonDiscussionAction } from "@/app/(member)/learn/lesson-actions";

/**
 * Talking about a lesson.
 *
 * The thread is a real post in a real space, so this is the feed's own comment
 * panel pointed at it — the same composer, the same sorting, the same
 * moderation and the same notifications. Nothing about commenting is
 * reimplemented here; what is here is the first click, which is what brings
 * the thread into existence.
 */
export function LessonDiscussion({
  lessonId,
  discussion,
  viewer,
  spaceHref,
}: {
  lessonId: string;
  /** Null until somebody starts it. */
  discussion: { postId: string; spaceSlug: string } | null;
  viewer: { name: string; avatar: string | null };
  /** Where the wider conversation lives, when there is one. */
  spaceHref: string | null;
}) {
  const router = useRouter();
  const [postId, setPostId] = useState(discussion?.postId ?? null);
  const [spaceSlug, setSpaceSlug] = useState(discussion?.spaceSlug ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startLessonDiscussionAction(lessonId);
      if (result.ok) {
        setPostId(result.postId);
        setSpaceSlug(result.spaceSlug);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
          Questions about this lesson
        </h2>
        {spaceSlug ? (
          <Link
            href={`/spaces/${spaceSlug}`}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand no-underline hover:underline"
          >
            See the whole room
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="rounded-card border border-border bg-surface px-3.5 pb-3.5 pt-1">
        {postId ? (
          <CommentPanel postId={postId} open viewer={viewer} />
        ) : (
          <div className="py-3 text-center">
            <p className="text-[13.5px] text-foreground-muted">
              Nobody has asked anything here yet.
            </p>
            {error ? (
              <p
                role="alert"
                className="mt-1.5 text-[12.5px] font-semibold text-danger"
              >
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={start}
              disabled={pending}
              className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-ctl bg-brand-fill px-4 text-[13.5px] font-semibold text-brand-fill-foreground transition hover:bg-brand-fill-hover disabled:opacity-70"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <MessageSquare className="size-3.5" aria-hidden />
              )}
              Start the discussion
            </button>
            {spaceHref ? (
              <p className="mt-2 text-[12px] text-foreground-muted">
                It will appear in{" "}
                <Link href={spaceHref} className="font-semibold underline">
                  the course room
                </Link>{" "}
                too, so the people who can answer see it.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
