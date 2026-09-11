"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { PostActions } from "@/components/feed/post-actions";
import { CommentPanel } from "@/components/feed/comment-panel";

type PreviewComment = {
  id: string;
  body: string;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
};

/**
 * Owns the one piece of state the action row and the comment panel share:
 * whether replies are open. Keeping it here lets PostCard stay a server
 * component while only the interactive parts hydrate.
 *
 * Votes are not here — they live in the rail and hold their own optimistic
 * state, because nothing else on the card depends on the score.
 */
export function PostFooter({
  postId,
  commentCount,
  myReaction,
  counts,
  saved,
  viewer,
  compact = false,
  previewComments = [],
  totalComments = 0,
}: {
  postId: string;
  commentCount: number;
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
  viewer: { name: string; avatar: string | null };
  compact?: boolean;
  previewComments?: PreviewComment[];
  totalComments?: number;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(commentCount);

  return (
    <>
      <PostActions
        postId={postId}
        commentCount={count}
        myReaction={myReaction}
        counts={counts}
        saved={saved}
        commentsOpen={open}
        onToggleComments={() => setOpen((value) => !value)}
        compact={compact}
      />

      {/* Two replies as a taste of the conversation, hidden once the full panel
          is open so the same comments do not appear twice. */}
      {!open && previewComments.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
          {previewComments.map((comment) => {
            const who = comment.author.profile?.displayName ?? comment.author.handle;
            return (
              <li key={comment.id} className="flex gap-2">
                <Avatar
                  name={who}
                  src={comment.author.profile?.avatarUrl}
                  size="sm"
                  className="size-5 text-[9px]"
                />
                <p className="min-w-0 text-[13px] leading-[1.45] text-foreground-muted">
                  <span className="font-bold text-foreground">{who}</span>{" "}
                  {comment.body}
                </p>
              </li>
            );
          })}
          {totalComments > previewComments.length ? (
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-[12.5px] font-bold text-brand transition hover:underline"
              >
                Show all {totalComments} replies
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      <CommentPanel
        postId={postId}
        open={open}
        viewer={viewer}
        onCountChange={setCount}
      />
    </>
  );
}
