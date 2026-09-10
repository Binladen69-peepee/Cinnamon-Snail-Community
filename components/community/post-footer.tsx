"use client";

import { useState } from "react";
import { PostInteractions } from "@/components/community/post-interactions";
import { CommentPanel } from "@/components/community/comment-panel";

/**
 * Owns the one piece of state the action bar and the comment panel share:
 * whether comments are open. Keeping it here lets PostCard stay a server
 * component while the interactive parts hydrate on their own.
 */
export function PostFooter({
  postId,
  commentCount,
  score,
  myVote,
  myReaction,
  counts,
  saved,
  viewer,
}: {
  postId: string;
  commentCount: number;
  score: number;
  myVote: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
  viewer: { name: string; avatar: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(commentCount);

  return (
    <>
      <PostInteractions
        postId={postId}
        commentCount={count}
        score={score}
        myVote={myVote}
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
