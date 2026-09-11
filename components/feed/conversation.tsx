"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { CornerDownLeft, Link2, MessageSquare, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { VoteRail } from "@/components/feed/vote-rail";
import { formatShortTime } from "@/lib/community/format-count";
import type { DetailComment } from "@/lib/community/post-detail";
import { cn } from "@/lib/utils";

/**
 * Past this depth the indent would leave no room for the words.
 *
 * Reddit stops indenting and offers "continue this thread" instead. Four levels
 * is the target the phase set, and at the measured 22px a level that costs 88px
 * — which a 360px phone can afford and a fifth cannot.
 */
const MAX_INDENT = 4;

/**
 * What one level of nesting costs horizontally.
 *
 * Measured, not guessed: at a 20px rail plus an 8px gap plus 6px of list
 * padding, each level took 34px and the deepest visible reply was left 275px on
 * a 485px viewport — around 180px on a real phone, which is too narrow to read.
 * A 16px rail and a 6px gap, with the list padding dropped since the rail
 * already provides the offset, costs 22px instead and gives the deepest reply
 * roughly 50px back.
 */

/**
 * The conversation under a post.
 *
 * The nesting is carried by one hairline thread line per level, not by a card
 * per comment. A card per comment meant a four-deep reply drew four nested
 * boxes and squeezed the text to nothing, which is exactly the failure this
 * phase exists to avoid.
 *
 * The line is also the collapse target, which is how Reddit does it and is a
 * far larger hit area than a small toggle — and on a phone it is the difference
 * between usable and not.
 */
export function Conversation({
  comments,
  postId,
  viewer,
}: {
  comments: DetailComment[];
  postId: string;
  viewer: { name: string; avatar: string | null };
}) {
  if (comments.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface px-6 py-8 text-center">
        <MessageSquare className="mx-auto size-5 text-foreground-muted" aria-hidden />
        <p className="mt-2.5 text-[14.5px] font-bold text-foreground">
          No replies yet
        </p>
        <p className="mt-1 text-[13px] text-foreground-muted">
          Say the first thing — a question counts.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-2.5 sm:p-3">
      <ul className="space-y-2">
        {comments.map((comment) => (
          <li key={comment.id}>
            <Node comment={comment} postId={postId} viewer={viewer} depth={0} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Node({
  comment,
  postId,
  viewer,
  depth,
}: {
  comment: DetailComment;
  postId: string;
  viewer: { name: string; avatar: string | null };
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [showDeeper, setShowDeeper] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const name = comment.author.profile?.displayName ?? comment.author.handle;
  const hidden = countDescendants(comment);
  const isHost = comment.author.handle === "adam";
  const atLimit = depth >= MAX_INDENT;

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    start(async () => {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: comment.id }),
      });
      if (!response.ok) return;
      form.reset();
      setReplyOpen(false);
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={`Expand ${name}'s thread`}
          className="grid size-5 shrink-0 place-items-center rounded-chip border border-border text-foreground-muted transition hover:border-brand hover:text-brand"
        >
          <Plus className="size-3" aria-hidden />
        </button>
        <p className="min-w-0 truncate text-[12.5px] text-foreground-muted">
          <span className="font-bold text-foreground">{name}</span>
          {hidden > 0
            ? ` and ${hidden} more ${hidden === 1 ? "reply" : "replies"}`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <div id={`comment-${comment.id}`} className="flex gap-1.5">
      {/* The thread line. Clicking anywhere on it collapses the branch. */}
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label={`Collapse ${name}'s thread`}
        className="group/line relative flex w-4 shrink-0 justify-center"
      >
        <Avatar
          name={name}
          src={comment.author.profile?.avatarUrl}
          size="sm"
          className="absolute top-0 size-4 text-[8px]"
        />
        <span
          aria-hidden
          className="mt-5 w-px flex-1 rounded-full bg-border transition-colors group-hover/line:bg-brand"
        />
      </button>

      <div className="min-w-0 flex-1 pb-0.5">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] leading-tight">
          <Link
            href={`/members/${comment.author.handle}`}
            className="font-bold text-foreground no-underline hover:underline"
          >
            {name}
          </Link>
          {isHost ? (
            <span className="rounded-full bg-brand-wash px-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-brand-strong">
              Host
            </span>
          ) : null}
          <span className="text-foreground-muted">
            {formatShortTime(new Date(comment.createdAt))}
          </span>
        </p>

        <div
          className="prose-vu mt-1 text-[14px] leading-[1.5] text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: comment.bodyHtml || comment.plainText }}
        />

        <div className="mt-0.5 flex items-center gap-0.5">
          <VoteRail
            commentId={comment.id}
            returnToPostId={comment.postId}
            score={comment.score}
            myVote={comment.myVote}
            layout="row"
          />
          <button
            type="button"
            onClick={() => setReplyOpen((open) => !open)}
            aria-expanded={replyOpen}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-chip px-2 text-[12px] font-bold transition",
              replyOpen
                ? "bg-brand-wash text-brand"
                : "text-foreground-muted hover:bg-mint hover:text-foreground",
            )}
          >
            <CornerDownLeft className="size-3" aria-hidden />
            Reply
          </button>
          {/* A permalink to this comment, so a reply can be pointed at. */}
          <a
            href={`/posts/${comment.postId}#comment-${comment.id}`}
            title="Link to this reply"
            className="inline-flex size-7 items-center justify-center rounded-chip text-foreground-muted no-underline transition hover:bg-mint hover:text-foreground"
          >
            <Link2 className="size-3" aria-hidden />
            <span className="sr-only">Link to this reply</span>
          </a>
        </div>

        {replyOpen ? (
          <form onSubmit={submitReply} className="mt-1.5 flex gap-1.5">
            <input
              name="body"
              required
              autoFocus
              placeholder={`Reply to ${name}…`}
              disabled={pending}
              className="h-8 min-w-0 flex-1 rounded-full border border-border bg-mint/40 px-3 text-[13.5px] text-foreground outline-none transition focus:border-brand focus:bg-surface disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-forest px-3 text-[12.5px] font-bold text-paper transition hover:bg-deep-forest disabled:opacity-50 dark:bg-brand dark:text-[#06120d]"
            >
              {pending ? "Posting…" : "Reply"}
            </button>
          </form>
        ) : null}

        {comment.replies.length > 0 ? (
          atLimit && !showDeeper ? (
            // Stop indenting rather than squeezing the words to nothing. The
            // rest of the chain is one tap away, in place.
            <button
              type="button"
              onClick={() => setShowDeeper(true)}
              className="mt-1.5 text-[12.5px] font-bold text-brand transition hover:underline"
            >
              Continue this thread ({hidden} more)
            </button>
          ) : (
            // No list padding: the rail above already provides the offset, and
            // doubling it was costing 6px a level for nothing.
            <ul className="mt-1.5 space-y-1.5">
              {comment.replies.map((reply) => (
                <li key={reply.id}>
                  <Node
                    comment={reply}
                    postId={postId}
                    viewer={viewer}
                    depth={atLimit ? 0 : depth + 1}
                  />
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

function countDescendants(comment: DetailComment): number {
  return comment.replies.reduce(
    (sum, reply) => sum + 1 + countDescendants(reply),
    0,
  );
}
