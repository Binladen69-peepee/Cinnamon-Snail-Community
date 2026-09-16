"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Link2,
  MapPin,
  MessageSquare,
  Pencil,
  Trophy,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Composer } from "@/components/feed/composer";
import { PostCard, type FeedPost } from "@/components/feed/post-card";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { formatShortTime } from "@/lib/community/format-count";
import type { ProfileActivity } from "@/lib/community/profile";
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
    };
    badges: BadgeItem[];
    activity: ProfileActivity[];
    posts: FeedPost[];
    mySpaces: SpaceOption[];
  };
  viewer: { name: string; avatar: string | null };
  uploadsEnabled: boolean;
}) {
  const [tab, setTab] = useState<Tab>("posts");
  const joined = new Date(profile.joinedAt);

  return (
    <div className="space-y-4">
      {/* Cover + identity */}
      <section className="overflow-hidden rounded-card border border-border bg-surface shadow-e1">
        <div className="relative h-40 overflow-hidden sm:h-48 md:h-56">
          <div
            className="absolute inset-0 bg-[linear-gradient(135deg,#0f3d32_0%,#1a5c48_42%,#2d6a4f_70%,#40916c_100%)]"
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 80%, rgba(255,248,239,0.25), transparent 45%), radial-gradient(circle at 80% 20%, rgba(255,248,239,0.12), transparent 40%)",
            }}
            aria-hidden
          />
          <LeafCluster className="pointer-events-none absolute -left-6 bottom-0 w-36 text-paper/25 sm:w-44" />
          <LeafCluster className="pointer-events-none absolute -right-4 top-2 w-28 rotate-[18deg] text-paper/20 sm:w-36" />
          <p className="font-hand absolute bottom-4 right-5 max-w-[14rem] text-right text-[1.35rem] leading-tight text-paper/90 sm:bottom-6 sm:right-8 sm:max-w-[16rem] sm:text-[1.6rem]">
            Good food brings people together
          </p>
        </div>

        <div className="relative px-4 pb-5 pt-0 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
            <div className="relative -mt-12 shrink-0 sm:-mt-14">
              <div className="relative inline-block rounded-full bg-surface p-1 shadow-e2">
                <Avatar
                  name={profile.displayName}
                  src={profile.avatarUrl}
                  size="lg"
                  className="size-24 text-xl sm:size-28 sm:text-2xl"
                />
                <span
                  className="absolute bottom-2 right-2 size-3.5 rounded-full bg-brand ring-2 ring-surface"
                  title="Active"
                  aria-label="Active"
                />
              </div>
            </div>

            <div className="min-w-0 flex-1 pt-1 lg:pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[1.65rem] leading-none tracking-[-0.02em] text-foreground sm:text-[1.85rem]">
                  {profile.displayName}
                </h1>
                {profile.isHost ? (
                  <CheckCircle2
                    className="size-5 text-brand"
                    aria-label="Verified host"
                  />
                ) : null}
              </div>
              {profile.headline ? (
                <p className="mt-1.5 text-[14px] text-foreground-muted">
                  {profile.headline}
                </p>
              ) : (
                <p className="mt-1.5 text-[14px] text-foreground-muted">
                  @{profile.handle}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-foreground-muted">
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
                <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.55] text-foreground">
                  {profile.bio}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {profile.links.map((href) => (
                  <SocialLink key={href} href={href} />
                ))}
                {profile.isOwner ? (
                  <Link
                    href="/settings"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border bg-mint/40 px-3.5 text-[13px] font-semibold text-foreground no-underline transition hover:border-brand hover:bg-brand-wash"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit Profile
                  </Link>
                ) : (
                  <Link
                    href={`/messages?to=${profile.handle}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[12px] bg-forest px-3.5 text-[13px] font-semibold text-paper no-underline transition hover:bg-deep-forest dark:bg-[#fff8ef] dark:text-[#0f3d32]"
                  >
                    <MessageSquare className="size-3.5" aria-hidden />
                    Message
                  </Link>
                )}
              </div>
            </div>

            {/* Stats + skills */}
            <aside className="w-full shrink-0 space-y-3 lg:w-[280px] lg:pt-4">
              <div className="grid grid-cols-2 gap-2 rounded-card border border-border bg-background/60 p-3">
                <Stat
                  value={profile.stats.classesTaken}
                  label="Classes Taken"
                  icon={<BookOpen className="size-3.5 text-brand" aria-hidden />}
                />
                <Stat
                  value={profile.stats.courses}
                  label="Courses"
                  icon={
                    <GraduationCap className="size-3.5 text-brand" aria-hidden />
                  }
                />
                <Stat
                  value={profile.stats.posts}
                  label="Community Posts"
                  icon={
                    <MessageSquare className="size-3.5 text-brand" aria-hidden />
                  }
                />
                <Stat
                  value={profile.stats.badges}
                  label="Badges"
                  icon={<Trophy className="size-3.5 text-apricot" aria-hidden />}
                />
              </div>

              {profile.interests.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-foreground-muted">
                    Skills & Interests
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.interests.slice(0, 12).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[10px] border border-border bg-mint/50 px-2.5 py-1 text-[12px] text-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <nav
        aria-label="Profile sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
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
              "shrink-0 border-b-2 px-4 py-2.5 text-[14px] transition",
              tab === id
                ? "border-brand font-semibold text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                profile.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    viewer={viewer}
                    density="card"
                    showSpace
                    canPin={false}
                  />
                ))
              )}
            </>
          ) : null}

          {tab === "classes" ? (
            <Panel title="Classes">
              {profile.stats.classesTaken === 0 ? (
                <EmptyState
                  title="No classes completed"
                  body="Finished lessons will show up here."
                />
              ) : (
                <ul className="space-y-2">
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
              {profile.bio ? (
                <p className="text-[14.5px] leading-[1.6] text-foreground">
                  {profile.bio}
                </p>
              ) : (
                <p className="text-[14px] text-foreground-muted">
                  No bio yet.
                </p>
              )}
              {profile.headline ? (
                <p className="mt-3 text-[13.5px] text-foreground-muted">
                  {profile.headline}
                </p>
              ) : null}
              {profile.location ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] text-foreground-muted">
                  <MapPin className="size-3.5" aria-hidden />
                  {profile.location}
                </p>
              ) : null}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {profile.badges.map((badge) => (
                    <div
                      key={badge.id}
                      className="flex items-start gap-3 rounded-card border border-border bg-background/50 p-3"
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
                <ul className="space-y-2">
                  {profile.activity.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>

        {/* Right widgets */}
        <aside className="space-y-3">
          <Panel
            title="My Recent Activity"
            action={
              <button
                type="button"
                onClick={() => setTab("activity")}
                className="text-[12.5px] font-semibold text-brand hover:underline"
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
            title="My Badges"
            action={
              <button
                type="button"
                onClick={() => setTab("badges")}
                className="text-[12.5px] font-semibold text-brand hover:underline"
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
                    className="flex w-[4.5rem] flex-col items-center gap-1.5 text-center"
                    title={badge.name}
                  >
                    <span className="grid size-12 place-items-center rounded-full border border-border bg-brand-wash text-brand">
                      <Award className="size-5" aria-hidden />
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-foreground-muted">
                      {badge.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Quick Actions">
            <div className="space-y-1.5">
              <QuickLink href="/learn" label="View My Classes" />
              <QuickLink href="/learn" label="View My Courses" />
              {profile.isOwner ? (
                <QuickLink href="/settings" label="Edit Profile" />
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
  );
}

function Stat({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] bg-surface px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[1.15rem] font-semibold tabular-nums leading-none text-foreground">
          {value}
        </p>
      </div>
      <p className="mt-1 text-[11px] leading-tight text-foreground-muted">{label}</p>
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
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
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
    <li className="flex gap-2.5">
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
      className="flex h-10 items-center justify-between rounded-[12px] border border-border bg-background/40 px-3 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-brand hover:bg-brand-wash"
    >
      {label}
      <ArrowRight className="size-4 text-foreground-muted" aria-hidden />
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
      className="grid size-9 place-items-center rounded-full border border-border text-foreground-muted no-underline transition hover:border-brand hover:text-brand"
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
