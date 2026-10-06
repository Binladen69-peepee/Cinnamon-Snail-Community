"use client";

import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
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
import { useIsMobile } from "@/components/hooks/use-media-query";
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
import { ActivityList } from "@/components/profile/activity-list";
import { BadgeShowcaseView, BadgeStrip } from "@/components/profile/badge-showcase";
import { PROFILE_TABS, type ProfileTab } from "@/components/profile/profile-tabs";
import { formatCount } from "@/lib/community/format-count";
import type { MemberProfile, ProfilePost } from "@/lib/community/profile";
import { toggleFollowAction } from "@/app/(member)/follow-actions";
import { cn } from "@/lib/utils";

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

/** In UTC, so the server's render and the browser's agree. */
const JOINED = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MEDIA_KINDS = ["image", "gif", "video"];

/**
 * A member's profile.
 *
 * Everything on it points somewhere: every activity row opens the exact post,
 * comment, lesson, class or live class; a badge opens on the Badges tab; a
 * post tile opens the post. The tab is in the URL (`?tab=`), so a link can
 * open the profile on Activity or Badges and the back button stays honest.
 *
 * "Show similarities" is a server-rendered slot under the header, offered on
 * other members' profiles only.
 */
export function ProfileView({
  profile,
  viewer,
  uploadsEnabled,
  initialTab,
  similarities,
}: {
  profile: MemberProfile;
  viewer: { name: string; avatar: string | null };
  uploadsEnabled: boolean;
  initialTab: ProfileTab;
  /** The "Show similarities" panel, streamed from the server. */
  similarities?: ReactNode;
}) {
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  // A link to the same profile with another `?tab=` (an activity row's badge,
  // say) arrives as a new prop; follow it.
  const [seenInitial, setSeenInitial] = useState<ProfileTab>(initialTab);
  if (initialTab !== seenInitial) {
    setSeenInitial(initialTab);
    setTab(initialTab);
  }

  const isMobile = useIsMobile();
  const [galleryPost, setGalleryPost] = useState<ProfilePost | null>(null);
  const [, startFollow] = useTransition();
  // The action revalidates this page, so the real count arrives as new props
  // as soon as it settles; until then the optimistic one stands in.
  const [follow, applyFollow] = useOptimistic(
    {
      following: profile.viewerIsFollowing,
      followers: profile.stats.followers,
    },
    (current, next: { following: boolean }) => ({
      following: next.following,
      followers: Math.max(0, current.followers + (next.following ? 1 : -1)),
    }),
  );
  const joined = new Date(profile.joinedAt);
  const handlePath = `/members/${encodeURIComponent(profile.handle)}`;

  function selectTab(next: ProfileTab) {
    setTab(next);
    const search = new URLSearchParams(window.location.search);
    if (next === "posts") search.delete("tab");
    else search.set("tab", next);
    const query = search.toString();
    // Shallow: the URL follows the tab without a round trip.
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }

  function openBadge(slug: string) {
    selectTab("badges");
    window.requestAnimationFrame(() => {
      document.getElementById(`badge-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function onFollow() {
    const next = !follow.following;
    const data = new FormData();
    data.set("handle", profile.handle);
    // The state wanted, not "toggle": a stale button cannot flip the wrong way.
    data.set("intent", next ? "follow" : "unfollow");
    startFollow(async () => {
      applyFollow({ following: next });
      await toggleFollowAction(data);
    });
  }

  const activityHref = `${handlePath}?tab=activity`;

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
                    variant={follow.following ? "secondary" : "primary"}
                    onClick={onFollow}
                    aria-pressed={follow.following}
                  >
                    <UserPlus className="size-4" aria-hidden />
                    {follow.following ? "Following" : "Follow"}
                  </Button>
                  {profile.canMessage ? (
                    <ButtonLink href={`/messages/new?to=${encodeURIComponent(profile.handle)}`}>
                      <MessageSquare className="size-4" aria-hidden />
                      Message
                    </ButtonLink>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* One quiet row of numbers: the social ones, then the learning
              ones. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <CountStat
              value={profile.stats.posts}
              label="Posts"
              onClick={() => selectTab("posts")}
            />
            <CountStat value={follow.followers} label="Followers" />
            <CountStat value={profile.stats.following} label="Following" />
            <span className="hidden h-3.5 w-px bg-border sm:block" aria-hidden />
            <CountStat
              value={profile.stats.classes}
              label="Classes"
              onClick={() => selectTab("classes")}
            />
            <CountStat value={profile.stats.lessons} label="Lessons" />
            <CountStat
              value={profile.stats.badges}
              label="Badges"
              onClick={() => selectTab("badges")}
            />
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
              Joined <time dateTime={joined.toISOString()}>{JOINED.format(joined)}</time>
            </span>
          </div>

          {profile.bio ? (
            <p className="max-w-2xl whitespace-pre-line text-reading text-foreground text-pretty">
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
                  href={`/members?interest=${encodeURIComponent(tag.slug)}`}
                  title={`Find other members who picked ${tag.label}`}
                  className={chipClass(false)}
                >
                  {tag.label}
                </Link>
              ))}
            </div>
          )}

          {similarities ? <div className="mt-1">{similarities}</div> : null}
        </header>

        <TabBar label="Profile sections" className="mt-8">
          {PROFILE_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
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
                {profile.isOwner ? (
                  <Composer
                    name={viewer.name}
                    avatar={viewer.avatar}
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
                  <ul className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label="Posts">
                    {profile.posts.map((post) => (
                      <li key={post.id}>
                        <PostTile
                          post={post}
                          // Phones show media in place on the post's page; the
                          // lightbox is for screens with room for one.
                          onOpen={isMobile ? undefined : () => setGalleryPost(post)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {tab === "activity" ? (
              <Card padding="none">
                <CardHeader
                  title="Activity"
                  description="Posts, replies, classes, live classes and badges. Each one opens where it happened."
                />
                {profile.activity.length === 0 ? (
                  <EmptyState
                    size="sm"
                    bordered={false}
                    icon={<CalendarDays />}
                    title="Quiet so far"
                    description={
                      profile.isOwner
                        ? "Your posts, replies, classes and badges will appear here."
                        : `${profile.displayName}’s posts, replies, classes and badges will appear here.`
                    }
                  />
                ) : (
                  <ActivityList items={profile.activity} />
                )}
              </Card>
            ) : null}

            {tab === "badges" ? (
              <BadgeShowcaseView
                showcase={profile.badges}
                isOwner={profile.isOwner}
                displayName={profile.displayName}
              />
            ) : null}

            {tab === "classes" ? (
              <>
                <Card padding="none">
                  <CardHeader
                    title="Classes finished"
                    icon={<GraduationCap />}
                    action={
                      <Link href="/learn" className={HEADER_ACTION}>
                        Class library
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    }
                  />
                  {profile.classesCompleted.length === 0 ? (
                    <EmptyState
                      size="sm"
                      bordered={false}
                      icon={<GraduationCap />}
                      title="No classes finished yet"
                      description="A class shows up here once every lesson in it is done."
                    />
                  ) : (
                    <ActivityList items={profile.classesCompleted} />
                  )}
                </Card>
                <Card padding="none">
                  <CardHeader title="Lessons completed" icon={<BookOpen />} />
                  {profile.lessonsCompleted.length === 0 ? (
                    <EmptyState
                      size="sm"
                      bordered={false}
                      icon={<BookOpen />}
                      title="No lessons completed"
                      description="Finished lessons will show up here."
                    />
                  ) : (
                    <ActivityList items={profile.lessonsCompleted} />
                  )}
                </Card>
              </>
            ) : null}

            {tab === "about" ? (
              <Card padding="none">
                <CardHeader title="About" />
                <dl className="divide-y divide-separator">
                  <AboutItem term="Bio">
                    <span className="whitespace-pre-line text-reading">
                      {profile.bio || "No bio yet."}
                    </span>
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
                      answer different questions. Each is a link into the
                      directory filtered to that tag. */}
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
                              href={`/members?interest=${encodeURIComponent(tag.slug)}`}
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
          </div>

          <aside className="flex flex-col gap-4" aria-label="Profile highlights">
            <Card padding="none">
              <CardHeader
                title="Recent activity"
                action={
                  <Link
                    href={activityHref}
                    onClick={(event) => {
                      event.preventDefault();
                      selectTab("activity");
                    }}
                    className={HEADER_ACTION}
                  >
                    View all
                  </Link>
                }
              />
              {profile.activity.length === 0 ? (
                <p className="px-4 py-4 text-label text-foreground-muted">Nothing yet.</p>
              ) : (
                <ActivityList items={profile.activity.slice(0, 5)} compact />
              )}
            </Card>

            <Card padding="none">
              <CardHeader
                title="Badges"
                count={profile.badges.earned.length}
                action={
                  <button
                    type="button"
                    onClick={() => selectTab("badges")}
                    className={HEADER_ACTION}
                  >
                    View all
                  </button>
                }
              />
              {profile.badges.earned.length === 0 ? (
                <p className="px-4 py-4 text-label text-foreground-muted">
                  {profile.isOwner
                    ? "None yet. Your progress is on the Badges tab."
                    : "No badges yet."}
                </p>
              ) : (
                <BadgeStrip earned={profile.badges.earned} onOpen={openBadge} />
              )}
            </Card>

            <Card padding="none">
              <CardHeader title="Quick actions" />
              <div className="divide-y divide-separator">
                <QuickLink href="/learn" label="Browse the class library" />
                {profile.isOwner ? (
                  <QuickLink href="/settings" label="Edit profile" />
                ) : profile.canMessage ? (
                  <QuickLink
                    href={`/messages/new?to=${encodeURIComponent(profile.handle)}`}
                    label="Send a message"
                  />
                ) : null}
                <QuickLink href="/members" label="Find more members" />
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
            body: galleryPost.body,
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
            space: galleryPost.space,
            pinnedAt: galleryPost.pinnedAt,
            _count: { comments: galleryPost.commentCount },
          }}
          media={galleryPost.attachments.filter((file) => MEDIA_KINDS.includes(file.kind))}
          viewer={viewer}
          canPin
        />
      ) : null}
    </div>
  );
}

/**
 * One post on the grid. Always a link to the post itself (an idea's link goes
 * to the Ideas board); on a wide screen a post with media opens the lightbox
 * instead, and the link still works with a modifier key or a middle click.
 */
function PostTile({
  post,
  onOpen,
}: {
  post: ProfilePost;
  onOpen?: () => void;
}) {
  const media = post.attachments.filter((file) => MEDIA_KINDS.includes(file.kind));
  const first = media[0];
  const multi = media.length > 1;
  const label = post.title?.trim() || post.excerpt || "Open post";

  if (!first) {
    return (
      <Link
        href={post.href}
        className="relative block aspect-square overflow-hidden rounded-ctl border border-border bg-surface p-3 no-underline transition hover:border-hairline-firm hover:bg-surface-muted"
      >
        <span className="line-clamp-5 text-caption text-foreground">
          {post.title?.trim() || post.excerpt || "Post"}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={post.href}
      aria-label={label}
      onClick={(event) => {
        if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onOpen();
      }}
      className="group relative block aspect-square overflow-hidden rounded-ctl bg-surface-muted"
    >
      {first.kind === "video" ? (
        <video
          src={first.url}
          poster={first.thumbnailUrl ?? undefined}
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
          loading="lazy"
          className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        />
      )}
      {/* Media markers share one corner, side by side. */}
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
    </Link>
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
      rel="noopener noreferrer nofollow ugc"
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
