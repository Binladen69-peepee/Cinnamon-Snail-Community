import type { ReactNode } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { voteAction } from "@/app/(member)/community-actions";
import { cn } from "@/lib/utils";

export function VoteButtons({
  postId,
  commentId,
  returnToPostId,
  score,
  myVote,
  layout = "rail",
}: {
  postId?: string;
  commentId?: string;
  returnToPostId?: string;
  score: number;
  myVote: number;
  layout?: "rail" | "pill";
}) {
  const pill = layout === "pill";
  return (
    <div
      className={
        pill
          ? "inline-flex h-11 items-center rounded-full border border-sand bg-warm-white px-1"
          : "flex w-8 shrink-0 flex-col items-center"
      }
    >
      <VoteForm postId={postId} commentId={commentId} returnToPostId={returnToPostId} value={1}>
        <button
          type="submit"
          className={cn(
            "inline-flex items-center justify-center rounded-full",
            pill ? "size-9" : "size-8",
            myVote === 1 ? "text-accent" : "text-foreground-muted hover:text-accent",
          )}
          aria-label="Upvote"
          aria-pressed={myVote === 1}
        >
          <ArrowBigUp className="size-5" fill={myVote === 1 ? "currentColor" : "none"} />
        </button>
      </VoteForm>
      <span
        className={cn(
          "min-w-[1.25rem] text-center text-xs font-bold tabular-nums",
          myVote === 1 ? "text-forest" : "text-foreground",
        )}
      >
        {score}
      </span>
      <VoteForm postId={postId} commentId={commentId} returnToPostId={returnToPostId} value={-1}>
        <button
          type="submit"
          className={cn(
            "inline-flex items-center justify-center rounded-full",
            pill ? "size-9" : "size-8",
            myVote === -1 ? "text-foreground" : "text-foreground-muted hover:text-foreground",
          )}
          aria-label="Downvote"
          aria-pressed={myVote === -1}
        >
          <ArrowBigDown className="size-5" fill={myVote === -1 ? "currentColor" : "none"} />
        </button>
      </VoteForm>
    </div>
  );
}

function VoteForm({
  postId,
  commentId,
  returnToPostId,
  value,
  children,
}: {
  postId?: string;
  commentId?: string;
  returnToPostId?: string;
  value: 1 | -1;
  children: ReactNode;
}) {
  return (
    <form action={voteAction}>
      {postId ? <input type="hidden" name="postId" value={postId} /> : null}
      {commentId ? <input type="hidden" name="commentId" value={commentId} /> : null}
      {returnToPostId ? <input type="hidden" name="returnToPostId" value={returnToPostId} /> : null}
      <input type="hidden" name="value" value={value} />
      {children}
    </form>
  );
}
