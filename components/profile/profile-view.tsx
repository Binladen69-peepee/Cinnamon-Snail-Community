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
  UserPlus,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Composer } from "@/components/feed/composer";
import { PostGalleryModal } from "@/components/feed/post-gallery-modal";
import type { FeedPost } from "@/components/feed/post-card";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  TabBar,
  buttonClass,
  chipClass,
  tabClass,
} from "@/components/app/ui";
import { formatCount, formatShortTime } from "@/lib/community/format-count";
import type { ProfileActivity } from "@/lib/community/profile";
import { toggleFollowAction } from "@/app/(member)/follow-actions";
import { cn } from "@/lib/utils";

type Tab = "posts" | "classes" | "about" | "badges" | "activity";

const TABS = [
  ["posts", "Posts"],
  ["classes", "Classes"],
  ["about", "About"],
  ["badges", "Badges"],
  ["activity", "Activity"],
] as const;

const SKILL_WORDS = {
  BEGINNER: "Beginner — still finding my feet",
  CONFIDENT: "Confident — I cook most nights",
  ADVANCED: "Advanced — happy improvising",
} as const;

const INTEREST_GROUPS = [
  { kind: "CUISINE", label: "Cuisines" },
  { kind: "TECHNIQUE", label: "Techniques" },
  { kind: "DIETARY", label: "Dietary needs" },
  { kind: "EQUIPMENT", label: "Equipment" },
  { kind: "GOAL", label: "Working on" },
] as const;

/** The small uppercase label over a value in the About card. */
const TERM = "text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted";

/** "View all" in a card header: a quiet button that keeps the strip's height. */
const HEADER_ACTION = buttonClass({ variant: "ghost", size: "sm", className: "-my-1.5 -mr-2" });

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
    cookingLately: string | null;
    skill: "BEGINNER" | "CONFIDENT" | "ADVANCED" | null;
    interests: { slug: string; label: string; kind: string }[];
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
  const lessons = profile.activity.filter((item) => item.kind === "lesson");

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
      {/* The teal band, flush under the app header, with the photo over its
          edge, as in the brand reference. The line on it is decoration and is
          kept out of the accessibility tree. */}
      <div
        className="vu-band relative h-32 w-full overflow-hidden sm:h-44"
        aria-hidden
      >
        <p className="font-hand absolute bottom-3 right-4 text-heading leading-none text-foreground-muted sm:right-6">
          Good food brings people together
        </p>
      </div>

      <div className="mx-auto w-full max-w-275 px-4 sm:px-6">
        {/* Identity: avatar over the band, then name, actions, a quiet row of
            numbers, and what the member says about themselves. */}
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
              <Avatar
                name={profile.displayName}
                src={profile.avatarUrl}
                size="xl"
                className="-mt-12 self-start shadow-e2 ring-4 ring-background sm:-mt-14 sm:size-28 sm:text-2xl"
              />

              <div className="min-w-0 sm:pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="text-display font-semibold tracking-[-0.02em] text-foreground text-balance">
                    {profile.displayName}
                  </h1>
                  {profile.isHost ? (
                    <CheckCircle2
                      className="size-5 shrink-0 text-brand"
                      aria-label="Verified host"
                    />
                  ) : null}
                </div>
                <p className="mt-0.5 text-body text-foreground-muted">
                  {profile.headline || `@${profile.handle}`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              {profile.isOwner ? (
                <ButtonLink href="/settings">
                  <Pencil className="size-4" aria-hidden />
                  Edit Profile
                </ButtonLink>
              ) : (
                <>
                  <Button
                    variant={followState.following ? "secondary" : "primary"}
                    onClick={onFollow}
                  >
                    <UserPlus className="size-4" aria-hidden />
                    {followState.following ? "Following" : "Follow"}
                  </Button>
                  <ButtonLink href={`/messages?to=${profile.handle}`}>
                    <MessageSquare className="size-4" aria-hidden />
                    Message
                  </ButtonLink>
                </>
              )}
            </div>
          </div>

          {/* One quiet row of numbers: the social ones, then the learning
              ones. Followers used to appear here and again in a strip below. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <CountStat
              value={profile.stats.posts}
              label="Posts"
              onClick={() => setTab("posts")}
            />
            <CountStat value={followState.followers} label="Followers" />
            <CountStat value={profile.stats.following} label="Following" />
            <span className="hidden h-3.5 w-px bg-border sm:block" aria-hidden />
            <CountStat value={profile.stats.classesTaken} label="Classes" />
            <CountStat value={profile.stats.courses} label="Courses" />
            <CountStat value={profile.stats.badges} label="Badges" />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-foreground-muted">
            {profile.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {profile.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden />
              Joined{" "}
              {joined.toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          {profile.bio ? (
            <p className="max-w-2xl text-reading text-foreground text-pretty">
              {profile.bio}
            </p>
          ) : null}

          {(profile.links.length > 0 || profile.interests.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {profile.links.map((href) => (
                <SocialLink key={href} href={href} />
              ))}
              {profile.interests.slice(0, 8).map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/members?interest=${tag.slug}`}
                  title={`Find other members who picked ${tag.label}`}
                  className={chipClass(false)}
                >
                  {tag.label}
                </Link>
              ))}
            </div>
          )}
        </header>

        <TabBar label="Profile sections" className="mt-8">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "true" : undefined}
              className={tabClass(tab === id)}
            >
              {label}
            </button>
          ))}
        </TabBar>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 flex-col gap-4">
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
                    icon={<Images />}
                    title="No posts yet"
                    description={
                      profile.isOwner
                        ? "Share something with the community — a plate counts."
                        : `${profile.displayName} hasn’t posted yet.`
                    }
                  />
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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
              <Card padding="none">
                <CardHeader
                  title="Classes completed"
                  action={
                    <Link href="/learn" className={HEADER_ACTION}>
                      Browse classes
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  }
                />
                {lessons.length === 0 ? (
                  <EmptyState
                    size="sm"
                    bordered={false}
                    icon={<BookOpen />}
                    title="No classes completed"
                    description="Finished lessons will show up here."
                  />
                ) : (
                  <ul className="divide-y divide-separator">
                    {lessons.map((item) => (
                      <ActivityRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}

            {tab === "about" ? (
              <Card padding="none">
                <CardHeader title="About" />
                <dl className="divide-y divide-separator">
                  <AboutItem term="Bio">
                    <span className="text-reading">{profile.bio || "No bio yet."}</span>
                  </AboutItem>
                  {profile.cookingLately ? (
                    <AboutItem term="Cooking lately">{profile.cookingLately}</AboutItem>
                  ) : null}
                  {profile.location ? (
                    <AboutItem term="Location">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-4 text-foreground-muted" aria-hidden />
                        {profile.location}
                      </span>
                    </AboutItem>
                  ) : null}
                  {profile.skill ? (
                    <AboutItem term="Skill level">{SKILL_WORDS[profile.skill]}</AboutItem>
                  ) : null}
                  {/* Grouped by kind, because "Japanese" and "Gluten free"
                      answer different questions and a single run of chips
                      reads as one undifferentiated list. Each is a link into
                      the directory filtered to that tag — which is the whole
                      reason the tags are rows. */}
                  {INTEREST_GROUPS.map((group) => {
                    const tags = profile.interests.filter(
                      (tag) => tag.kind === group.kind,
                    );
                    if (tags.length === 0) return null;
                    return (
                      <AboutItem key={group.kind} term={group.label}>
                        <span className="flex flex-wrap gap-1.5 pt-1">
                          {tags.map((tag) => (
                            <Link
                              key={tag.slug}
                              href={`/members?interest=${tag.slug}`}
                              className={chipClass(false)}
                            >
                              {tag.label}
                            </Link>
                          ))}
                        </span>
                      </AboutItem>
                    );
                  })}
                </dl>
              </Card>
            ) : null}

            {tab === "badges" ? (
              <Card padding="none">
                <CardHeader title="Badges" />
                {profile.badges.length === 0 ? (
                  <EmptyState
                    size="sm"
                    bordered={false}
                    icon={<Award />}
                    title="No badges yet"
                    description="Keep cooking and showing up — badges land here."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5">
                    {profile.badges.map((badge) => (
                      <div
                        key={badge.id}
                        className="flex items-start gap-3 rounded-ctl bg-surface-muted p-3"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
                          <Award className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-body font-semibold text-foreground">
                            {badge.name}
                          </p>
                          <p className="mt-0.5 text-label text-foreground-muted">
                            {badge.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : null}

            {tab === "activity" ? (
              <Card padding="none">
                <CardHeader title="Activity" />
                {profile.activity.length === 0 ? (
                  <EmptyState
                    size="sm"
                    bordered={false}
                    icon={<CalendarDays />}
                    title="Quiet so far"
                    description="Recent classes, badges, and posts will appear here."
                  />
                ) : (
                  <ul className="divide-y divide-separator">
                    {profile.activity.map((item) => (
                      <ActivityRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <Card padding="none">
              <CardHeader
                title="Recent activity"
                action={
                  <button
                    type="button"
                    onClick={() => setTab("activity")}
                    className={HEADER_ACTION}
                  >
                    View all
                  </button>
                }
              />
              {profile.activity.length === 0 ? (
                <p className="px-4 py-4 text-label text-foreground-muted">Nothing yet.</p>
              ) : (
                <ul className="flex flex-col gap-3 px-4 py-4">
                  {profile.activity.slice(0, 5).map((item) => (
                    <ActivityRow key={item.id} item={item} compact />
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="none">
              <CardHeader
                title="Badges"
                action={
                  <button
                    type="button"
                    onClick={() => setTab("badges")}
                    className={HEADER_ACTION}
                  >
                    View all
                  </button>
                }
              />
              {profile.badges.length === 0 ? (
                <p className="px-4 py-4 text-label text-foreground-muted">No badges yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3 px-4 py-4">
                  {profile.badges.slice(0, 4).map((badge) => (
                    <div
                      key={badge.id}
                      className="flex w-17 flex-col items-center gap-1.5 text-center"
                      title={badge.name}
                    >
                      <span className="grid size-11 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
                        <Award className="size-4" aria-hidden />
                      </span>
                      <span className="line-clamp-2 text-micro text-foreground-muted">
                        {badge.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card padding="none">
              <CardHeader title="Quick actions" />
              <div className="divide-y divide-separator">
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
            </Card>
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
        className="relative aspect-square overflow-hidden rounded-ctl border border-border bg-surface p-3 no-underline transition hover:border-hairline-firm hover:bg-surface-muted"
      >
        <p className="line-clamp-5 text-caption text-foreground">
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
      className="group relative aspect-square overflow-hidden rounded-ctl bg-surface-muted"
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
      {/* Media markers share one corner, side by side, so a video that leads
          a set of several no longer has the two drawn over each other. */}
      {first.kind === "video" || multi ? (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {multi ? (
            <span className="text-white drop-shadow">
              <Images className="size-4" aria-hidden />
            </span>
          ) : null}
          {first.kind === "video" ? (
            <span className="grid size-6 place-items-center rounded-full bg-black/55 text-white">
              <Play className="size-3 translate-x-px" aria-hidden />
            </span>
          ) : null}
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
        "inline-flex items-baseline gap-1 text-label",
        onClick && "group rounded-chip",
      )}
    >
      <span className="font-semibold tabular-nums text-foreground">
        {formatCount(value)}
      </span>
      <span
        className={cn(
          "text-foreground-muted",
          onClick && "transition group-hover:text-foreground",
        )}
      >
        {label}
      </span>
    </Tag>
  );
}

function AboutItem({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <dt className={TERM}>{term}</dt>
      <dd className="mt-1 text-body text-foreground">{children}</dd>
    </div>
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
    <li className={cn("flex gap-3", !compact && "px-4 py-3 sm:px-5")}>
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash",
          compact ? "size-7" : "mt-0.5 size-8",
        )}
      >
        <Icon className={compact ? "size-3.5" : "size-4"} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-foreground", compact ? "text-label" : "text-body")}>
          {item.label}
        </p>
        {item.detail && !compact ? (
          <p className="mt-0.5 text-label text-foreground-muted">{item.detail}</p>
        ) : null}
        <p className="mt-0.5 text-caption text-foreground-muted">
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
      className="flex items-center justify-between gap-3 px-4 py-3 text-label font-medium text-foreground no-underline transition hover:bg-surface-muted"
    >
      {label}
      <ArrowRight className="size-4 text-foreground-muted" aria-hidden />
    </Link>
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
      className={buttonClass({ size: "sm", iconOnly: true })}
    >
      {kind === "x" ? (
        <XIcon className="size-4" />
      ) : (
        <Link2 className="size-4" aria-hidden />
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
