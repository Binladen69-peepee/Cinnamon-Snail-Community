import Link from "next/link";
import { BadgeCheck, Bookmark, Ellipsis } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/utils";
import {
  pinAction,
  reportAction,
  saveAction,
  votePollAction,
} from "@/app/(member)/community-actions";
import { ShareButton } from "@/components/community/share-button";
import { VideoEmbed } from "@/components/community/video-embed";
import { VoteButtons } from "@/components/community/vote-buttons";
import { FacebookReactions } from "@/components/community/facebook-reactions";
import { InlineComments } from "@/components/community/inline-comments";

type PreviewComment = {
  id: string;
  body: string;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
};

type PostCardPost = {
  id: string;
  title: string | null;
  bodyHtml: string | null;
  plainText: string;
  type: string;
  linkUrl: string | null;
  pinnedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  score: number;
  myVote?: number;
  myReaction?: string | null;
  reactionCounts?: Record<string, number>;
  reactionTotal?: number;
  comments?: PreviewComment[];
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  space: { name: string; slug: string };
  attachments: { id: string; url: string; alt: string | null; kind: string }[];
  pollOptions: { id: string; label: string; _count: { votes: number } }[];
  _count: { comments: number; bookmarks: number };
};

export function PostCard({
  post,
  preview = true,
}: {
  post: PostCardPost;
  preview?: boolean;
}) {
  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = post.publishedAt ?? post.createdAt;
  const images = post.attachments.filter(
    (file) => file.kind === "image" || file.kind === "gif",
  );
  const previewComments = post.comments?.slice(0, 3) ?? [];

  return (
    <article className="vu-card vu-card-hover overflow-hidden p-5">
      <div className="flex items-start gap-3">
        <Link href={`/members/${post.author.handle}`} className="mt-0.5 shrink-0">
          <Avatar name={name} src={post.author.profile?.avatarUrl} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-foreground-muted">
            <Link
              href={`/members/${post.author.handle}`}
              className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-forest"
            >
              {name}
              {post.author.handle === "adam" ? (
                <BadgeCheck className="size-3.5 text-accent" aria-label="Host" />
              ) : null}
            </Link>
            <span aria-hidden>·</span>
            <Link href={`/spaces/${post.space.slug}`} className="hover:text-forest hover:underline">
              {post.space.name}
            </Link>
            <span aria-hidden>·</span>
            <time>{formatRelativeTime(stamp)}</time>
            {post.pinnedAt ? (
              <>
                <span aria-hidden>·</span>
                <span>Pinned</span>
              </>
            ) : null}
          </div>
        </div>
        <details className="relative">
          <summary
            className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-foreground-muted hover:bg-mint [&::-webkit-details-marker]:hidden"
            aria-label="More actions"
          >
            <Ellipsis className="size-4" />
          </summary>
          <div className="vu-card absolute right-0 z-20 mt-1 w-36 overflow-hidden py-1">
            <form action={saveAction}>
              <input type="hidden" name="postId" value={post.id} />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm hover:bg-mint">
                Save
              </button>
            </form>
            <form action={reportAction}>
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="reason" value="needs_review" />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm hover:bg-mint">
                Report
              </button>
            </form>
            <form action={pinAction}>
              <input type="hidden" name="postId" value={post.id} />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm hover:bg-mint">
                {post.pinnedAt ? "Unpin" : "Pin"}
              </button>
            </form>
          </div>
        </details>
      </div>

      {post.title ? (
        <h2 className="mt-4 font-display text-[20px] font-bold leading-[1.25] tracking-tight text-foreground">
          <Link href={`/posts/${post.id}`}>{post.title}</Link>
        </h2>
      ) : null}

      {post.plainText ? (
        <div
          className={
            preview
              ? "prose-vu mt-2 line-clamp-4 text-[15px] leading-[1.55] text-foreground-muted [&_a]:text-forest"
              : "prose-vu mt-2 text-[16px] leading-[1.55] text-foreground-muted [&_a]:text-forest [&_p]:mb-3"
          }
          dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
        />
      ) : null}

      {images.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl bg-mint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]!.url}
            alt={images[0]!.alt ?? ""}
            className="max-h-[520px] w-full object-cover transition duration-200 hover:scale-[1.02]"
          />
        </div>
      ) : null}

      {post.type === "VIDEO" && post.linkUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl">
          <VideoEmbed url={post.linkUrl} />
        </div>
      ) : post.linkUrl && post.type !== "VIDEO" ? (
        <a
          href={post.linkUrl}
          className="mt-3 inline-block text-sm font-medium text-forest"
          target="_blank"
          rel="noreferrer"
        >
          {post.linkUrl}
        </a>
      ) : null}

      {post.pollOptions.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {post.pollOptions.map((option) => (
            <li key={option.id}>
              <form action={votePollAction}>
                <input type="hidden" name="optionId" value={option.id} />
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center justify-between rounded-[14px] border border-sand bg-cream px-4 text-sm"
                >
                  <span>{option.label}</span>
                  <span className="text-foreground-muted">{option._count.votes}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-1">
        <VoteButtons postId={post.id} score={post.score} myVote={post.myVote ?? 0} layout="pill" />
        <InlineComments postId={post.id} commentCount={post._count.comments} />
        <FacebookReactions
          postId={post.id}
          counts={post.reactionCounts ?? {}}
          myReaction={post.myReaction ?? null}
          total={post.reactionTotal ?? 0}
        />
        <ShareButton path={`/posts/${post.id}`} />
        <form action={saveAction}>
          <input type="hidden" name="postId" value={post.id} />
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-foreground-muted hover:bg-mint"
          >
            <Bookmark className="size-3.5" aria-hidden />
            Save
          </button>
        </form>
      </div>

      {preview && previewComments.length > 0 ? (
        <ul className="mt-4 space-y-3 border-t border-sand pt-4">
          {previewComments.map((comment) => {
            const commentName = comment.author.profile?.displayName ?? comment.author.handle;
            return (
              <li key={comment.id} className="flex gap-3">
                <Avatar name={commentName} src={comment.author.profile?.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{commentName}</p>
                  <p className="text-sm leading-relaxed text-foreground-muted">{comment.body}</p>
                </div>
              </li>
            );
          })}
          {post._count.comments > previewComments.length ? (
            <li>
              <Link href={`/posts/${post.id}`} className="text-sm font-semibold text-forest">
                View all {post._count.comments} comments
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      {!preview ? (
        <p className="mt-3 text-xs font-semibold text-foreground-muted">
          {post._count.comments} comments
        </p>
      ) : null}
    </article>
  );
}
