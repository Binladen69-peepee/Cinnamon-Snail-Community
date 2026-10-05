"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Loader2,
  MessageSquare,
  MessagesSquare,
} from "lucide-react";
import { CommentPanel } from "@/components/feed/comment-panel";
import { startLessonDiscussionAction } from "@/app/(member)/learn/lesson-actions";
import { Button, Card, EmptyState, SectionHeader } from "@/components/app/ui";

/**
 * Talking about a lesson.
 *
 * The thread is a real post in a real space, so this is the feed's own comment
 * panel pointed at it — the same composer, the same sorting, the same
 * moderation and the same notifications. Nothing about commenting is
 * reimplemented here; what is here is the first click, which is what brings
 * the thread into existence.
 *
 * The panel draws a rule above itself, for when it sits under a post. Here it
 * is the first thing in its card, so that rule is taken off from outside.
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
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Questions about this lesson"
        action={
          spaceSlug ? (
            <Link
              href={`/spaces/${spaceSlug}`}
              className="inline-flex items-center gap-1 text-label font-medium text-brand-strong no-underline hover:underline"
            >
              See the whole room
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : undefined
        }
      />

      {postId ? (
        <Card
          as="div"
          padding="none"
          className="px-4 pb-4 sm:px-5 sm:pb-5 [&>div:first-child]:mt-0 [&>div:first-child]:border-t-0"
        >
          <CommentPanel postId={postId} open viewer={viewer} />
        </Card>
      ) : (
        <Card as="div" padding="none">
          <EmptyState
            size="sm"
            bordered={false}
            icon={<MessagesSquare />}
            title="Nobody has asked anything here yet."
            description={
              spaceHref || error ? (
                <>
                  {spaceHref ? (
                    <>
                      It will appear in{" "}
                      <Link
                        href={spaceHref}
                        className="font-semibold text-link underline"
                      >
                        the course room
                      </Link>{" "}
                      too, so the people who can answer see it.
                    </>
                  ) : null}
                  {error ? (
                    <span
                      role="alert"
                      className="mt-1.5 block font-medium text-danger"
                    >
                      {error}
                    </span>
                  ) : null}
                </>
              ) : undefined
            }
            action={
              <Button variant="primary" onClick={start} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <MessageSquare className="size-4" aria-hidden />
                )}
                Start the discussion
              </Button>
            }
          />
        </Card>
      )}
    </section>
  );
}
