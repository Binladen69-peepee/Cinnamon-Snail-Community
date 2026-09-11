import Link from "next/link";
import { BadgeCheck, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatShortTime } from "@/lib/community/format-count";
import { PostFooter } from "@/components/community/post-footer";
import { PostMedia } from "@/components/community/post-media";
import { PostMenu } from "@/components/community/post-menu";
import { PostPoll } from "@/components/community/post-poll";
import { PostTypeBadge } from "@/components/community/post-type-badge";
import { VideoEmbed } from "@/components/community/video-embed";
import { VoteRail } from "@/components/community/vote-rail";
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
  attachments: {
    id: string;
    url: string;
    alt: string | null;
    kind: string;
    width?: number | null;
    height?: number | null;
  }[];
  pollOptions: { id: string; label: string; _count: { votes: number } }[];
  _count: { comments: number; bookmarks: number };
};

/**
 * A feed post: Reddit's vote rail down the left, Twitter's card above it.
 *
 * Three columns — votes, avatar, content — so the body copy starts at the same
 * left edge as the author's name rather than being indented under the picture.
 * That single alignment is most of what makes a feed read as a conversation
 * instead of a table of records.
 *
 * Elevation is deliberately flat: one hairline, no resting shadow. A shadow on
 * every card in a scrolling list flattens the hierarchy it is supposed to
 * create, and costs paint on every frame.
 */
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
  // Uploaded video is an attachment too; filtering to images dropped it
  // silently, so a member's video post rendered as an empty card.
  const media = post.attachments.filter((file) =>
    ["image", "gif", "video"].includes(file.kind),
  );
  const previewComments = post.comments?.slice(0, 2) ?? [];
  const isHost = post.author.handle === "adam";
  // Lesson discussion posts store an internal "vu:lesson:<id>" reference here,
  // which is not something to show a member as a link.
  const webLink = /^https?:\/\//.test(post.linkUrl ?? "") ? post.linkUrl : null;

  return (
    <article
      className={cn(
        "group/post relative overflow-hidden rounded-card border bg-surface",
        "transition-colors duration-150 hover:border-border",
        post.pinnedAt ? "border-brand/35" : "border-border/70",
        // Long feeds: the browser skips layout and paint for cards that are
        // offscreen. contain-intrinsic-size keeps the scrollbar honest.
        "[content-visibility:auto] [contain-intrinsic-size:auto_28rem]",
      )}
    >
      {post.pinnedAt ? (
        <p className="flex items-center gap-1.5 border-b border-brand/20 bg-brand-wash px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-strong sm:px-5">
          <Pin className="size-3" aria-hidden />
          Pinned by a host
        </p>
      ) : null}

      <div className="flex gap-2 p-3 sm:gap-3 sm:p-4">
        <VoteRail postId={post.id} score={post.score} myVote={post.myVote ?? 0} />

        <Link
          href={`/members/${post.author.handle}`}
          className="mt-0.5 shrink-0 rounded-full ring-2 ring-transparent transition hover:ring-brand/40"
          tabIndex={-1}
          aria-hidden
        >
          <Avatar name={name} src={post.author.profile?.avatarUrl} />
        </Link>

        <div className="min-w-0 flex-1">
          {/* One line: who, where, when. */}
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[14.5px] leading-tight">
              <Link
                href={`/members/${post.author.handle}`}
                className="font-bold text-foreground no-underline hover:underline"
              >
                {name}
              </Link>
              {isHost ? (
                <BadgeCheck
                  className="ml-1 inline size-4 -translate-y-px text-brand"
                  aria-label="Host"
                />
              ) : null}
              <span className="ml-1.5 hidden text-foreground-muted sm:inline">
                @{post.author.handle}
              </span>
              <span className="text-foreground-muted"> · </span>
              <Link
                href={`/spaces/${post.space.slug}`}
                className="font-medium text-foreground-muted no-underline hover:text-brand hover:underline"
              >
                {post.space.name}
              </Link>
              <span className="text-foreground-muted"> · </span>
              <Link
                href={`/posts/${post.id}`}
                className="text-foreground-muted no-underline hover:underline"
              >
                <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                  {formatShortTime(stamp)}
                </time>
              </Link>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <PostTypeBadge type={post.type} />
              <PostMenu
                postId={post.id}
                pinned={Boolean(post.pinnedAt)}
                canPin={canPin}
              />
            </div>
          </div>

          {post.title ? (
            <h2 className="mt-1.5 font-display text-[1.2rem] font-bold leading-[1.25] tracking-[-0.02em] text-foreground">
              <Link href={`/posts/${post.id}`} className="no-underline hover:underline">
                {post.title}
              </Link>
            </h2>
          ) : null}

          {post.plainText ? (
            <div
              className={cn(
                "prose-vu mt-1.5 text-[15px] leading-[1.58] text-foreground [&_a]:text-brand",
                preview ? "line-clamp-5" : "[&_p]:mb-3",
              )}
              dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
            />
          ) : null}

          <PostMedia items={media} postId={post.id} />

          {post.type === "VIDEO" && webLink ? (
            <div className="mt-3 overflow-hidden rounded-ctl">
              <VideoEmbed url={webLink} />
            </div>
          ) : webLink && post.type !== "VIDEO" ? (
            <a
              href={webLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block truncate rounded-ctl border border-border bg-mint/40 px-3.5 py-2.5 text-sm font-medium text-brand-strong no-underline transition hover:border-brand"
            >
              {webLink}
            </a>
          ) : null}

          {post.pollOptions.length > 0 ? <PostPoll options={post.pollOptions} /> : null}

          <PostFooter
            postId={post.id}
            commentCount={post._count.comments}
            myReaction={post.myReaction ?? null}
            counts={post.reactionCounts ?? {}}
            saved={post.myBookmark ?? false}
            viewer={viewer}
          />

          {preview && previewComments.length > 0 ? (
            <ul className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
              {previewComments.map((comment) => {
                const who =
                  comment.author.profile?.displayName ?? comment.author.handle;
                return (
                  <li key={comment.id} className="flex gap-2">
                    <Avatar
                      name={who}
                      src={comment.author.profile?.avatarUrl}
                      size="sm"
                    />
                    <p className="min-w-0 text-[14px] leading-[1.5] text-foreground-muted">
                      <span className="font-bold text-foreground">{who}</span>{" "}
                      {comment.body}
                    </p>
                  </li>
                );
              })}
              {post._count.comments > previewComments.length ? (
                <li>
                  <Link
                    href={`/posts/${post.id}`}
                    className="text-[13px] font-semibold text-brand no-underline hover:underline"
                  >
                    Show all {post._count.comments} replies
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
    </article>
  );
}
