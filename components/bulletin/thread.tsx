import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import type { BulletinThread } from "@/lib/bulletin";
import { PostFooter } from "@/components/feed/post-footer";
import { linkBtn } from "@/components/bulletin/ui";
import { cn } from "@/lib/utils";

export type BulletinViewer = { name: string; avatar: string | null };

/**
 * The conversation under a board item: the same reactions, comments and pin
 * as its Kitchen Table post, because it is that post (DEC-078).
 *
 * The feed's own footer, imported rather than copied, so a reaction or a
 * comment made here is the one the Kitchen Table shows, and the two views
 * cannot drift apart in behaviour either. Nothing renders while the item has
 * no post yet (the daily job writes any that are missing).
 */
export function BulletinThreadBar({
  thread,
  viewer,
}: {
  thread: BulletinThread | null;
  viewer: BulletinViewer;
}) {
  if (!thread) return null;
  return (
    <div className="-mx-2 mt-3 sm:-mx-3">
      <PostFooter
        postId={thread.postId}
        commentCount={thread.commentCount}
        myReaction={thread.myReaction}
        counts={thread.reactionCounts}
        pinned={thread.pinned}
        viewer={viewer}
      />
    </div>
  );
}

/**
 * The way from a board item to its post in the Kitchen Table. Every card has
 * one, so the item's name is spoken with it: a list of identical link names
 * is no list at all to a screen reader.
 */
export function KitchenTableLink({
  postId,
  title,
  className,
}: {
  postId: string;
  title: string;
  className?: string;
}) {
  return (
    <Link href={`/posts/${postId}`} className={cn(linkBtn, className)}>
      <MessagesSquare aria-hidden />
      Discuss in the Kitchen Table
      <span className="sr-only">: {title}</span>
    </Link>
  );
}
