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

      {!open && previewComments.length > 0 ? (
        <ul className="mt-1 space-y-2 border-t border-border px-1 pt-2">
          {previewComments.map((comment) => {
            const who =
              comment.author.profile?.displayName ?? comment.author.handle;
            return (
              <li key={comment.id} className="flex gap-2">
                <Avatar
                  name={who}
                  src={comment.author.profile?.avatarUrl}
                  size="sm"
                  className="size-7 rounded-[8px] text-[9px]"
                />
                <div className="min-w-0 flex-1 rounded-[12px] bg-mint/40 px-2.5 py-1.5">
                  <p className="text-[12.5px] font-semibold text-foreground">
                    {who}
                  </p>
                  <p className="text-[13px] leading-[1.4] text-foreground-muted">
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
                className="text-[12.5px] font-semibold text-[#378fe9] transition hover:underline"
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
