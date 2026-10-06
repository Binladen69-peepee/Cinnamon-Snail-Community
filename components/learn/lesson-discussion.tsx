"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, MessagesSquare } from "lucide-react";
import { CommentPanel } from "@/components/feed/comment-panel";
import { startLessonDiscussionAction } from "@/app/(member)/learn/lesson-actions";
import { Button, Card, EmptyState, SectionHeader } from "@/components/app/ui";

/**
 * Questions about a lesson, on the lesson.
 *
 * The thread is a real post, so this is the feed's own comment panel pointed at
 * it — the same composer, the same sorting, the same moderation and the same
 * notifications. Nothing about commenting is reimplemented here; what is here
 * is the first click, which is what brings the thread into existence.
 *
 * It is the lesson's comments and nothing more: there is no link out to a
 * course room or feed. Classes are a library, not a forum (DEC-078), so the
 * conversation about a lesson is read where the lesson is.
 *
 * The panel draws a rule above itself, for when it sits under a post. Here it
 * is the first thing in its card, so that rule is taken off from outside.
 */
export function LessonDiscussion({
  lessonId,
  discussion,
  viewer,
}: {
  lessonId: string;
  /** Null until somebody starts it. */
  discussion: { postId: string } | null;
  viewer: { name: string; avatar: string | null };
}) {
  const router = useRouter();
  const [postId, setPostId] = useState(discussion?.postId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startLessonDiscussionAction(lessonId);
      if (result.ok) {
        setPostId(result.postId);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`lesson-questions-${lessonId}`}>
      <SectionHeader
        title={<span id={`lesson-questions-${lessonId}`}>Questions about this lesson</span>}
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
              <>
                Stuck on a step, or swapped an ingredient? Ask here and the
                answer stays with this lesson for the next person.
                {error ? (
                  <span
                    role="alert"
                    className="mt-1.5 block font-medium text-danger"
                  >
                    {error}
                  </span>
                ) : null}
              </>
            }
            action={
              <Button variant="primary" onClick={start} disabled={pending} aria-busy={pending || undefined}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <MessageSquare className="size-4" aria-hidden />
                )}
                Ask a question
              </Button>
            }
          />
        </Card>
      )}
    </section>
  );
}
