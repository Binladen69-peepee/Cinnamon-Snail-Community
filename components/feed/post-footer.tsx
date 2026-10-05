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
 * Engagement footer: LinkedIn-style actions, optional comment previews, and the
 * expandable comment panel.
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

      {!open && !compact && previewComments.length > 0 ? (
        <ul className="mt-1 space-y-2 border-t border-separator px-2 pb-1 pt-3">
          {previewComments.map((comment) => {
            const who =
              comment.author.profile?.displayName ?? comment.author.handle;
            return (
              <li key={comment.id} className="flex gap-2.5">
                <Avatar
                  name={who}
                  src={comment.author.profile?.avatarUrl}
                  size="sm"
                  className="size-7 text-micro"
                />
                <div className="min-w-0 flex-1 rounded-ctl bg-surface-muted px-3 py-2">
                  <p className="text-caption font-semibold text-foreground">
                    {who}
                  </p>
                  <p className="mt-0.5 text-label text-foreground">
                    {comment.body}
                  </p>
                </div>
              </li>
            );
          })}
          {totalComments > previewComments.length ? (
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-chip text-label font-medium text-foreground-muted transition hover:text-foreground"
              >
                View all {totalComments} comments
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
