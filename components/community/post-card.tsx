import Link from "next/link";
import { BadgeCheck, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatRelativeTime } from "@/lib/utils";
import { VideoEmbed } from "@/components/community/video-embed";
import { PostFooter } from "@/components/community/post-footer";
import { PostMenu } from "@/components/community/post-menu";
import { PostPoll } from "@/components/community/post-poll";
import { PostTypeBadge } from "@/components/community/post-type-badge";
import { cn } from "@/lib/utils";

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
  myBookmark?: boolean;
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
  viewer,
  preview = true,
  canPin = false,
}: {
  post: PostCardPost;
  viewer: { name: string; avatar: string | null };
  preview?: boolean;
  canPin?: boolean;
}) {
  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = post.publishedAt ?? post.createdAt;
  const images = post.attachments.filter(
    (file) => file.kind === "image" || file.kind === "gif",
  );
  const previewComments = post.comments?.slice(0, 2) ?? [];

  return (
    <article
      className={cn(
        "group/post relative rounded-[1.5rem] border border-sand/80 bg-surface transition-shadow duration-200",
        "shadow-[0_1px_2px_rgba(15,61,50,0.04)] hover:shadow-[0_8px_28px_rgba(15,61,50,0.08)]",
        post.pinnedAt && "border-accent/30",
      )}
    >
      {post.pinnedAt ? (
        <p className="flex items-center gap-1.5 rounded-t-[1.5rem] border-b border-accent/20 bg-sage/60 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-forest">
          <Pin className="size-3" aria-hidden />
          Pinned by a host
        </p>
      ) : null}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link
            href={`/members/${post.author.handle}`}
            className="shrink-0 rounded-full ring-2 ring-transparent transition hover:ring-accent/40"
          >
            <Avatar name={name} src={post.author.profile?.avatarUrl} />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                href={`/members/${post.author.handle}`}
                className="inline-flex items-center gap-1 text-[15px] font-semibold text-foreground no-underline hover:text-forest"
              >
                {name}
                {post.author.handle === "adam" ? (
                  <BadgeCheck
                    className="size-4 text-accent"
                    aria-label="Host"
                  />
                ) : null}
              </Link>
              <PostTypeBadge type={post.type} />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-foreground-muted">
              <Link
                href={`/spaces/${post.space.slug}`}
                className="font-medium no-underline hover:text-forest hover:underline"
              >
                {post.space.name}
              </Link>
              <span aria-hidden>·</span>
              <time dateTime={stamp.toISOString()}>{formatRelativeTime(stamp)}</time>
            </p>
          </div>

          <PostMenu postId={post.id} pinned={Boolean(post.pinnedAt)} canPin={canPin} />
        </div>

        {/* Body */}
        {post.title ? (
          <h2 className="mt-3.5 font-display text-[1.3rem] font-bold leading-[1.28] tracking-tight text-foreground">
            <Link href={`/posts/${post.id}`} className="no-underline hover:text-forest">
              {post.title}
            </Link>
          </h2>
        ) : null}

        {post.plainText ? (
          <div
            className={cn(
              "prose-vu mt-2 text-[15px] leading-[1.6] text-foreground-muted [&_a]:text-forest",
              preview ? "line-clamp-4" : "[&_p]:mb-3",
            )}
            dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
          />
        ) : null}

        {images.length > 0 ? (
          <Link
            href={`/posts/${post.id}`}
            className="mt-4 block overflow-hidden rounded-[1.15rem] bg-mint no-underline"
          >
            {/* Member uploads are arbitrary hosts, not optimizer inputs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0]!.url}
              alt={images[0]!.alt ?? ""}
              loading="lazy"
              className="max-h-[30rem] w-full object-cover transition-transform duration-500 group-hover/post:scale-[1.015]"
            />
          </Link>
        ) : null}

        {post.type === "VIDEO" && post.linkUrl ? (
          <div className="mt-4 overflow-hidden rounded-[1.15rem]">
            <VideoEmbed url={post.linkUrl} />
          </div>
        ) : post.linkUrl && post.type !== "VIDEO" ? (
          <a
            href={post.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block truncate rounded-xl border border-sand bg-mint/40 px-3.5 py-2.5 text-sm font-medium text-forest no-underline transition hover:border-accent"
          >
            {post.linkUrl}
          </a>
        ) : null}

        {post.pollOptions.length > 0 ? (
          <PostPoll options={post.pollOptions} />
        ) : null}

        <PostFooter
          postId={post.id}
          commentCount={post._count.comments}
          score={post.score}
          myVote={post.myVote ?? 0}
          myReaction={post.myReaction ?? null}
          counts={post.reactionCounts ?? {}}
          saved={post.myBookmark ?? false}
          viewer={viewer}
        />

        {preview && previewComments.length > 0 ? (
          <ul className="mt-4 space-y-3 border-t border-sand/70 pt-4">
            {previewComments.map((comment) => {
              const commentName =
                comment.author.profile?.displayName ?? comment.author.handle;
              return (
                <li key={comment.id} className="flex gap-2.5">
                  <Avatar
                    name={commentName}
                    src={comment.author.profile?.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 rounded-2xl bg-mint/50 px-3.5 py-2.5">
                    <p className="text-[13px] font-semibold text-foreground">
                      {commentName}
                    </p>
                    <p className="text-sm leading-relaxed text-foreground-muted">
                      {comment.body}
                    </p>
                  </div>
                </li>
              );
            })}
            {post._count.comments > previewComments.length ? (
              <li>
                <Link
                  href={`/posts/${post.id}`}
                  className="text-[13px] font-semibold text-forest no-underline hover:underline"
                >
                  View all {post._count.comments} comments
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
