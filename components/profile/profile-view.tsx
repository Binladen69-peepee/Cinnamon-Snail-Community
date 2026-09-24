"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Images,
  Link2,
  MapPin,
  MessageSquare,
  Pencil,
  Play,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Composer } from "@/components/feed/composer";
import { PostGalleryModal } from "@/components/feed/post-gallery-modal";
import type { FeedPost } from "@/components/feed/post-card";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { formatCount, formatShortTime } from "@/lib/community/format-count";
import type { ProfileActivity } from "@/lib/community/profile";
import { toggleFollowAction } from "@/app/(member)/follow-actions";
import { cn } from "@/lib/utils";

type Tab = "posts" | "classes" | "about" | "badges" | "activity";

type BadgeItem = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  awardedAt: Date | string;
};

type SpaceOption = { id: string; name: string; slug: string };

export function ProfileView({
  profile,
  viewer,
  uploadsEnabled,
}: {
  profile: {
    isOwner: boolean;
    isHost: boolean;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    headline: string | null;
    location: string | null;
    joinedAt: Date | string;
    interests: string[];
    links: string[];
    stats: {
      classesTaken: number;
      courses: number;
      posts: number;
      badges: number;
      followers: number;
      following: number;
    };
    viewerIsFollowing: boolean;
    badges: BadgeItem[];
    activity: ProfileActivity[];
    posts: FeedPost[];
    mySpaces: SpaceOption[];
  };
  viewer: { name: string; avatar: string | null };
  uploadsEnabled: boolean;
}) {
  const [tab, setTab] = useState<Tab>("posts");
  const [galleryPost, setGalleryPost] = useState<FeedPost | null>(null);
  const [, startFollow] = useTransition();
  const [followState, applyFollow] = useOptimistic(
    {
      following: profile.viewerIsFollowing,
      followers: profile.stats.followers,
    },
    (
      current,
      next: { following: boolean },
    ) => ({
      following: next.following,
      followers: Math.max(
        0,
        current.followers + (next.following ? 1 : -1),
      ),
    }),
  );

  const joined = new Date(profile.joinedAt);

  function onFollow() {
    const next = !followState.following;
    const data = new FormData();
    data.set("handle", profile.handle);
    startFollow(async () => {
      applyFollow({ following: next });
      await toggleFollowAction(data);
    });
  }

  return (
    <div className="pb-8">
      {/* Full-bleed compact cover, flush under the app header */}
      <div className="relative h-28 w-full overflow-hidden sm:h-32">
        {/* A quiet band built from the surface tokens. It used to be a
            gradient between --brand-strong and --foreground, which are both
            white in dark mode: the cover became a solid white slab and the
            decoration on it disappeared. */}
        <div className="absolute inset-0 bg-surface-muted" aria-hidden />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 15% 100%, color-mix(in oklab, var(--background) 28%, transparent), transparent 50%), radial-gradient(ellipse at 90% 0%, color-mix(in oklab, var(--background) 14%, transparent), transparent 45%)",
          }}
          aria-hidden
        />
        <LeafCluster className="pointer-events-none absolute -left-8 -bottom-4 w-28 text-foreground/10 sm:w-36" />
        <LeafCluster className="pointer-events-none absolute -right-6 top-0 w-24 rotate-[16deg] text-foreground/[0.07] sm:w-28" />
        <p className="font-hand absolute bottom-3 right-4 text-[1.15rem] leading-none text-foreground-muted sm:right-6 sm:text-[1.3rem]">
          Good food brings people together
        </p>
      </div>

      <div className="mx-auto w-full max-w-[1100px] px-3 sm:px-6">
        {/* Identity row */}
        <section className="relative -mt-10 rounded-card border border-border bg-surface px-4 pb-5 pt-0 shadow-e1 sm:-mt-12 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <div className="relative z-[1] -mt-10 shrink-0 self-start sm:-mt-12">
              <Avatar
                name={profile.displayName}
                src={profile.avatarUrl}
                size="lg"
                className="size-[5.25rem] border-[3px] border-surface text-xl shadow-e2 sm:size-[6.25rem] sm:text-2xl"
              />
            </div>

            <div className="min-w-0 flex-1 pb-1 pt-2 sm:pt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1 className="text-[1.45rem] leading-none tracking-[-0.02em] text-foreground sm:text-[1.65rem]">
                      {profile.displayName}
                    </h1>
                    {profile.isHost ? (
                      <CheckCircle2
                        className="size-[1.15rem] text-brand"
                        aria-label="Verified host"
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13.5px] text-foreground-muted">
                    {profile.headline || `@${profile.handle}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {profile.isOwner ? (
                    <Link
                      href="/settings"
                      className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border bg-mint/50 px-3.5 text-[13px] font-semibold text-foreground no-underline transition hover:border-brand hover:bg-brand-wash"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit Profile
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onFollow}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-[12px] px-3.5 text-[13px] font-semibold transition",
                          followState.following
                            ? "border border-border bg-surface text-foreground hover:bg-mint"
                            : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover ",
                        )}
                      >
                        <UserPlus className="size-3.5" aria-hidden />
                        {followState.following ? "Following" : "Follow"}
                      </button>
                      <Link
                        href={`/messages?to=${profile.handle}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border px-3.5 text-[13px] font-semibold text-foreground no-underline transition hover:bg-mint"
                      >
                        <MessageSquare className="size-3.5" aria-hidden />
                        Message
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Posts / Followers / Following */}
              <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1">
                <CountStat
                  value={profile.stats.posts}
                  label="Posts"
                  onClick={() => setTab("posts")}
                />
                <CountStat value={followState.followers} label="Followers" />
                <CountStat value={profile.stats.following} label="Following" />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-foreground-muted">
                {profile.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden />
                    {profile.location}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden />
                  Joined{" "}
                  {joined.toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              {profile.bio ? (
                <p className="mt-2.5 max-w-2xl text-[14px] leading-[1.5] text-foreground">
                  {profile.bio}
                </p>
              ) : null}

              {(profile.links.length > 0 || profile.interests.length > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {profile.links.map((href) => (
                    <SocialLink key={href} href={href} />
                  ))}
                  {profile.interests.slice(0, 8).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-[10px] border border-border bg-mint/40 px-2.5 py-1 text-[11.5px] text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Compact learning stats strip */}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-4">
            <MiniStat
              value={profile.stats.classesTaken}
              label="Classes"
              icon={<BookOpen className="size-3.5 text-brand" aria-hidden />}
            />
            <MiniStat
              value={profile.stats.courses}
              label="Courses"
              icon={<GraduationCap className="size-3.5 text-brand" aria-hidden />}
            />
            <MiniStat
              value={profile.stats.badges}
              label="Badges"
              icon={<Trophy className="size-3.5 text-apricot" aria-hidden />}
            />
            <MiniStat
              value={followState.followers}
              label="Followers"
              icon={<Users className="size-3.5 text-brand" aria-hidden />}
            />
          </div>
        </section>

        {/* Tabs */}
        <nav
          aria-label="Profile sections"
          className="mt-4 flex gap-0.5 overflow-x-auto border-b border-border"
        >
          {(
            [
              ["posts", "Posts"],
              ["classes", "Classes"],
              ["about", "About"],
              ["badges", "Badges"],
              ["activity", "Activity"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-2.5 text-[13.5px] transition",
                tab === id
                  ? "border-brand font-semibold text-foreground"
                  : "border-transparent text-foreground-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-3">
            {tab === "posts" ? (
              <>
                {profile.isOwner && profile.mySpaces.length > 0 ? (
                  <Composer
                    name={viewer.name}
                    avatar={viewer.avatar}
                    spaces={profile.mySpaces}
                    defaultSpaceId={profile.mySpaces[0]?.id}
                    uploadsEnabled={uploadsEnabled}
                  />
                ) : null}
                {profile.posts.length === 0 ? (
                  <EmptyState
                    title="No posts yet"
                    body={
                      profile.isOwner
                        ? "Share something with the community — a plate counts."
                        : `${profile.displayName} hasn’t posted yet.`
                    }
                  />
                ) : (
                  <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                    {profile.posts.map((post) => (
                      <PostTile
                        key={post.id}
                        post={post}
                        onOpen={() => setGalleryPost(post)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : null}

            {tab === "classes" ? (
              <Panel title="Classes completed">
                {profile.activity.filter((item) => item.kind === "lesson").length ===
                0 ? (
                  <EmptyState
                    title="No classes completed"
                    body="Finished lessons will show up here."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {profile.activity
                      .filter((item) => item.kind === "lesson")
                      .map((item) => (
                        <ActivityRow key={item.id} item={item} />
                      ))}
                  </ul>
                )}
                <Link
                  href="/learn"
                  className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand no-underline hover:underline"
                >
                  Browse classes
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Panel>
            ) : null}

            {tab === "about" ? (
              <Panel title="About">
                <dl className="space-y-4">
                  <div>
                    <dt className="text-[11px] uppercase tracking-[0.1em] text-foreground-muted">
                      Bio
                    </dt>
                    <dd className="mt-1 text-[14.5px] leading-[1.55] text-foreground">
                      {profile.bio || "No bio yet."}
                    </dd>
                  </div>
                  {profile.headline ? (
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.1em] text-foreground-muted">
                        Focus
                      </dt>
                      <dd className="mt-1 text-[14px] text-foreground">
                        {profile.headline}
                      </dd>
                    </div>
                  ) : null}
                  {profile.location ? (
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.1em] text-foreground-muted">
                        Location
                      </dt>
                      <dd className="mt-1 inline-flex items-center gap-1.5 text-[14px] text-foreground">
                        <MapPin className="size-3.5 text-foreground-muted" aria-hidden />
                        {profile.location}
                      </dd>
                    </div>
                  ) : null}
                  {profile.interests.length > 0 ? (
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.1em] text-foreground-muted">
                        Interests
                      </dt>
                      <dd className="mt-2 flex flex-wrap gap-1.5">
                        {profile.interests.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-[10px] border border-border bg-mint/40 px-2.5 py-1 text-[12px] text-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </Panel>
            ) : null}

            {tab === "badges" ? (
              <Panel title="Badges">
                {profile.badges.length === 0 ? (
                  <EmptyState
                    title="No badges yet"
                    body="Keep cooking and showing up — badges land here."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {profile.badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="flex items-start gap-3 rounded-[12px] border border-border bg-background/50 p-3"
                      >
                        <span className="grid size-11 place-items-center rounded-full bg-brand-wash text-brand">
                          <Award className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-foreground">
                            {badge.name}
                          </p>
                          <p className="mt-0.5 text-[12.5px] text-foreground-muted">
                            {badge.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            ) : null}

            {tab === "activity" ? (
              <Panel title="Activity">
                {profile.activity.length === 0 ? (
                  <EmptyState
                    title="Quiet so far"
                    body="Recent classes, badges, and posts will appear here."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {profile.activity.map((item) => (
                      <ActivityRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}
          </div>

          <aside className="space-y-3">
            <Panel
              title="Recent activity"
              action={
                <button
                  type="button"
                  onClick={() => setTab("activity")}
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  View all
                </button>
              }
            >
              {profile.activity.length === 0 ? (
                <p className="text-[13px] text-foreground-muted">Nothing yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {profile.activity.slice(0, 5).map((item) => (
                    <ActivityRow key={item.id} item={item} compact />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="Badges"
              action={
                <button
                  type="button"
                  onClick={() => setTab("badges")}
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  View all
                </button>
              }
            >
              {profile.badges.length === 0 ? (
                <p className="text-[13px] text-foreground-muted">No badges yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {profile.badges.slice(0, 4).map((badge) => (
                    <div
                      key={badge.id}
                      className="flex w-[4.25rem] flex-col items-center gap-1 text-center"
                      title={badge.name}
                    >
                      <span className="grid size-11 place-items-center rounded-full border border-border bg-brand-wash text-brand">
                        <Award className="size-4" aria-hidden />
                      </span>
                      <span className="line-clamp-2 text-[10.5px] leading-tight text-foreground-muted">
                        {badge.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Quick actions">
              <div className="space-y-1.5">
                <QuickLink href="/learn" label="View classes" />
                <QuickLink href="/learn" label="View courses" />
                {profile.isOwner ? (
                  <QuickLink href="/settings" label="Edit profile" />
                ) : (
                  <QuickLink
                    href={`/messages?to=${profile.handle}`}
                    label="Send a message"
                  />
                )}
              </div>
            </Panel>
          </aside>
        </div>
      </div>

      {galleryPost ? (
        <PostGalleryModal
          open
          onClose={() => setGalleryPost(null)}
          post={{
            id: galleryPost.id,
            title: galleryPost.title,
            bodyHtml: galleryPost.bodyHtml,
            plainText: galleryPost.plainText,
            score: galleryPost.score,
            myVote: galleryPost.myVote,
            myReaction: galleryPost.myReaction,
            reactionCounts: galleryPost.reactionCounts,
            myBookmark: galleryPost.myBookmark,
            publishedAt: galleryPost.publishedAt,
            createdAt: galleryPost.createdAt,
            author: galleryPost.author,
            space: {
              name: galleryPost.space.name,
              slug: galleryPost.space.slug,
            },
            pinnedAt: galleryPost.pinnedAt,
            _count: { comments: galleryPost._count.comments },
          }}
          media={galleryPost.attachments.filter((file) =>
            ["image", "gif", "video"].includes(file.kind),
          )}
          viewer={viewer}
        />
      ) : null}
    </div>
  );
}

function PostTile({
  post,
  onOpen,
}: {
  post: FeedPost;
  onOpen: () => void;
}) {
  const media = post.attachments.filter((file) =>
    ["image", "gif", "video"].includes(file.kind),
  );
  const first = media[0];
  const multi = media.length > 1;

  if (!first) {
    return (
      <Link
        href={`/posts/${post.id}`}
        className="relative aspect-square overflow-hidden rounded-[10px] border border-border bg-mint/50 p-3 no-underline transition hover:border-brand"
      >
        <p className="line-clamp-5 text-[12px] leading-snug text-foreground">
          {post.title || post.plainText || "Post"}
        </p>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={post.title || "View post"}
      className="group relative aspect-square overflow-hidden rounded-[10px] border border-border bg-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {first.kind === "video" ? (
        <video
          src={first.url}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={first.url}
          alt={first.alt ?? ""}
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      )}
      {first.kind === "video" ? (
        <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white">
          <Play className="size-3 translate-x-px" aria-hidden />
        </span>
      ) : null}
      {multi ? (
        <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
          <Images className="size-4" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

function CountStat({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-baseline gap-1.5 text-[13.5px]",
        onClick && "rounded-md transition hover:text-brand",
      )}
    >
      <span className="font-semibold tabular-nums text-foreground">
        {formatCount(value)}
      </span>
      <span className="text-foreground-muted">{label}</span>
    </Tag>
  );
}

function MiniStat({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-background/60 px-2.5 py-2">
      {icon}
      <div>
        <p className="text-[15px] font-semibold tabular-nums leading-none text-foreground">
          {value}
        </p>
        <p className="mt-0.5 text-[11px] text-foreground-muted">{label}</p>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-e1">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[13.5px] font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActivityRow({
  item,
  compact = false,
}: {
  item: ProfileActivity;
  compact?: boolean;
}) {
  const Icon =
    item.kind === "badge"
      ? Award
      : item.kind === "course"
        ? GraduationCap
        : item.kind === "post"
          ? MessageSquare
          : BookOpen;

  return (
    <li className={cn("flex gap-2.5", !compact && "py-2.5 first:pt-0 last:pb-0")}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-mint text-brand">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-foreground",
            compact ? "text-[13px] leading-snug" : "text-[14px]",
          )}
        >
          {item.label}
        </p>
        {item.detail && !compact ? (
          <p className="mt-0.5 text-[12.5px] text-foreground-muted">{item.detail}</p>
        ) : null}
        <p className="mt-0.5 text-[11.5px] text-foreground-muted">
          {formatShortTime(new Date(item.at))}
        </p>
      </div>
    </li>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-10 items-center justify-between rounded-[12px] border border-border bg-background/40 px-3 text-[13px] font-semibold text-foreground no-underline transition hover:border-brand hover:bg-brand-wash"
    >
      {label}
      <ArrowRight className="size-3.5 text-foreground-muted" aria-hidden />
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-border px-5 py-10 text-center">
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 text-[13.5px] text-foreground-muted">{body}</p>
    </div>
  );
}

function SocialLink({ href }: { href: string }) {
  const kind = detectLink(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className="grid size-8 place-items-center rounded-full border border-border text-foreground-muted no-underline transition hover:border-brand hover:text-brand"
    >
      {kind === "x" ? (
        <XIcon className="size-3.5" />
      ) : (
        <Link2 className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">{kind}</span>
    </a>
  );
}

function detectLink(href: string) {
  const lower = href.toLowerCase();
  if (lower.includes("linkedin")) return "linkedin";
  if (lower.includes("youtube") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "x";
  return "web";
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.924L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}
