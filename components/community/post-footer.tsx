"use client";

import { useState } from "react";
import { PostEngagement } from "@/components/community/post-engagement";
import { CommentPanel } from "@/components/community/comment-panel";

/**
 * Owns the one piece of state the engagement row and the comment panel share:
 * whether replies are open. Keeping it here lets PostCard stay a server
 * component while only the interactive parts hydrate.
 *
 * Votes are not in here — they live in the rail on the left of the card and
 * hold their own optimistic state, because nothing else on the card depends on
 * the score.
 */
export function PostFooter({
  postId,
  commentCount,
  myReaction,
  counts,
  saved,
  viewer,
}: {
  postId: string;
  commentCount: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
  viewer: { name: string; avatar: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(commentCount);

  return (
    <>
      <PostEngagement
        postId={postId}
        commentCount={count}
        myReaction={myReaction}
        counts={counts}
        saved={saved}
        commentsOpen={open}
        onToggleComments={() => setOpen((value) => !value)}
      />
      <CommentPanel
        postId={postId}
        open={open}
        viewer={viewer}
        onCountChange={setCount}
      />
    </>
  );
}
