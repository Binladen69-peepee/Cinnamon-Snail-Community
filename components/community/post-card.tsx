import Link from "next/link";
import { Ellipsis } from "lucide-react";
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

  return (
    <article className="vu-card vu-card-hover p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Link href={`/spaces/${post.space.slug}`} className="mt-0.5 shrink-0">
          <Avatar name={post.space.name} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <Link
              href={`/spaces/${post.space.slug}`}
              className="font-semibold text-foreground hover:underline"
            >
              {post.space.name}
            </Link>
            <span aria-hidden>·</span>
            <Link href={`/members/${post.author.handle}`} className="hover:underline">
              {name}
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
            className="flex size-8 cursor-pointer list-none items-center justify-center text-foreground-muted hover:bg-background [&::-webkit-details-marker]:hidden"
            style={{ borderRadius: 12 }}
            aria-label="More actions"
          >
            <Ellipsis className="size-4" />
          </summary>
          <div className="vu-card absolute right-0 z-20 mt-1 w-36 overflow-hidden py-1">
            <form action={saveAction}>
              <input type="hidden" name="postId" value={post.id} />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm hover:bg-background">
                Save
              </button>
            </form>
            <form action={reportAction}>
              <input type="hidden" name="postId" value={post.id} />
              <input type="hidden" name="reason" value="needs_review" />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm hover:bg-background">
                Report
              </button>
            </form>
            <form action={pinAction}>
              <input type="hidden" name="postId" value={post.id} />
              <button type="submit" className="block w-full px-3 py-2 text-left text-sm hover:bg-background">
                {post.pinnedAt ? "Unpin" : "Pin"}
              </button>
            </form>
          </div>
        </details>
      </div>

      {post.title ? (
        <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
          <Link href={`/posts/${post.id}`}>{post.title}</Link>
        </h2>
      ) : null}

      {post.plainText ? (
        <div
          className={
            preview
              ? "prose-vu mt-2 line-clamp-4 text-sm leading-relaxed text-foreground [&_a]:text-accent"
              : "prose-vu mt-2 text-foreground [&_a]:text-accent [&_p]:mb-3"
          }
          dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
        />
      ) : null}

      {images.length > 0 ? (
        <div className="mt-3 overflow-hidden bg-background" style={{ borderRadius: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]!.url}
            alt={images[0]!.alt ?? ""}
            className="max-h-[420px] w-full object-cover"
          />
        </div>
      ) : null}

      {post.type === "VIDEO" && post.linkUrl ? (
        <div className="mt-3 overflow-hidden" style={{ borderRadius: 12 }}>
          <VideoEmbed url={post.linkUrl} />
        </div>
      ) : post.linkUrl && post.type !== "VIDEO" ? (
        <a
          href={post.linkUrl}
          className="mt-2 inline-block text-sm text-accent"
          target="_blank"
          rel="noreferrer"
        >
          {post.linkUrl}
        </a>
      ) : null}

      {post.pollOptions.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {post.pollOptions.map((option) => (
            <li key={option.id}>
              <form action={votePollAction}>
                <input type="hidden" name="optionId" value={option.id} />
                <button
                  type="submit"
                  className="flex min-h-10 w-full items-center justify-between bg-background px-4 text-sm"
                  style={{ borderRadius: 12 }}
                >
                  <span>{option.label}</span>
                  <span className="text-foreground-muted">{option._count.votes}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VoteButtons postId={post.id} score={post.score} myVote={post.myVote ?? 0} layout="pill" />
        <FacebookReactions
          postId={post.id}
          counts={post.reactionCounts ?? {}}
          myReaction={post.myReaction ?? null}
          total={post.reactionTotal ?? 0}
        />
        <ShareButton path={`/posts/${post.id}`} />
      </div>
      {preview ? (
        <div className="mt-2">
          <InlineComments postId={post.id} commentCount={post._count.comments} />
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-foreground-muted">{post._count.comments} comments</p>
      )}
    </article>
  );
}
