"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { PostActions } from "@/components/feed/post-actions";
import { CommentPanel } from "@/components/feed/comment-panel";
import { REPLY_BOX_ID } from "@/lib/community/comment-anchor";

type PreviewComment = {
  id: string;
  body: string;
  /** Plain text, no markup (C2). Older callers may not send it. */
  excerpt?: string;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
};

/**
 * Engagement footer: the actions, a preview of the latest comments, and the
 * expandable comment panel.
 *
 * On the post page the conversation is already on the page, so `onPostPage`
 * turns Comment into a jump to the reply box rather than opening a second
 * copy of the same thread inside the card.
 */
export function PostFooter({
  postId,
  commentCount,
  myReaction,
  counts,
  pinned,
  viewer,
  compact = false,
  onPostPage = false,
  previewComments = [],
  totalComments = 0,
}: {
  postId: string;
  commentCount: number;
  myReaction: string | null;
  counts: Record<string, number>;
  /** Whether the reader had pinned it when it was loaded. */
  pinned: boolean;
  viewer: { name: string; avatar: string | null };
  compact?: boolean;
  onPostPage?: boolean;
  previewComments?: PreviewComment[];
  totalComments?: number;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(commentCount);

  function jumpToReply() {
    const box = document.getElementById(REPLY_BOX_ID);
    if (!box) return;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
    box.focus({ preventScroll: true });
  }

  return (
    <>
      <PostActions
        postId={postId}
        commentCount={onPostPage ? commentCount : count}
        myReaction={myReaction}
        counts={counts}
        pinned={pinned}
        commentsOpen={onPostPage ? undefined : open}
        onToggleComments={onPostPage ? jumpToReply : () => setOpen((value) => !value)}
        compact={compact}
      />

      {!onPostPage && !open && !compact && previewComments.length > 0 ? (
        <ul className="mt-1 space-y-2 border-t border-separator px-2 pb-1 pt-3">
          {previewComments.map((comment) => {
            const who = comment.author.profile?.displayName ?? comment.author.handle;
            return (
              <li key={comment.id} className="flex gap-2.5">
                <Avatar
                  name={who}
                  src={comment.author.profile?.avatarUrl}
                  size="sm"
                  className="size-7 text-micro"
                />
                <div className="min-w-0 flex-1 rounded-ctl bg-surface-muted px-3 py-2">
                  <p className="text-caption font-semibold text-foreground">{who}</p>
                  {/* An excerpt: plain text, so a preview never shows markup. */}
                  <p className="mt-0.5 line-clamp-3 text-label text-foreground">
                    {comment.excerpt ?? comment.body}
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

      {onPostPage ? null : (
        <CommentPanel postId={postId} open={open} viewer={viewer} onCountChange={setCount} />
      )}
    </>
  );
}
