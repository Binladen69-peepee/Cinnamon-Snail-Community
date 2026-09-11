import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { CalendarDays, ExternalLink, Lock, Pin } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { PostCard } from "@/components/community/post-card";
import { FeedSortBar } from "@/components/community/feed-sort-bar";
import { FeedComposer } from "@/components/community/feed-composer";
import { SpaceHeader, type SpaceTab } from "@/components/community/space-header";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { parseFeedSort } from "@/lib/community/sort";
import { getSpaceForMember, markSpaceRead } from "@/lib/spaces";
import { SPACE_KIND_BLURB, SPACE_KIND_LABEL, tabsForKind } from "@/lib/spaces/kinds";
import type { SpaceKind } from "@/lib/spaces";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { formatShortTime } from "@/lib/community/format-count";

const TAB_LABEL: Record<string, string> = {
  feed: "Posts",
  events: "Events",
  courses: "Lessons",
  members: "Members",
  about: "About",
};

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const query = await searchParams;
  const sort = parseFeedSort(query.sort);

  const result = await getSpaceForMember(session.user.id, slug);
  if (!result) notFound();
  const { space, membership, canEnter, canJoin, canDiscover } = result;

  // A private space is not merely locked, it is unlisted: someone who cannot
  // discover it gets a 404, not a "this exists but you cannot see it".
  if (!canDiscover) notFound();

  if (!canEnter) {
    return (
      <EmptyState
        title="This space is private"
        body="You need an invitation from a host to join this kitchen."
        actionLabel="Browse other spaces"
        actionHref="/discover?tab=spaces"
      />
    );
  }

  const kind = space.kind as SpaceKind;
  const available = tabsForKind(kind);
  const tab = available.includes(query.tab ?? "") ? query.tab! : "feed";

  const tabs: SpaceTab[] = available.map((value) => ({
    value,
    label: TAB_LABEL[value] ?? value,
    count:
      value === "feed"
        ? space._count.posts
        : value === "events"
          ? space._count.events
          : value === "courses"
            ? space._count.courses
            : value === "members"
              ? space._count.memberships
              : undefined,
  }));

  // Clearing unread happens after the response, never during render: a page
  // must not wipe the state it is displaying.
  //
  // This calls the domain function directly rather than the server action. The
  // action re-checks auth and calls revalidatePath, neither of which works
  // inside after() — the write silently never happened, and the swallowed error
  // made it look as though unread simply did not clear. The member layout is
  // force-dynamic, so it re-queries on the next request anyway and needs no
  // revalidation.
  if (membership) {
    const spaceId = space.id;
    const userId = session.user.id;
    after(async () => {
      try {
        await markSpaceRead(userId, spaceId);
      } catch (error) {
        console.error("[space] could not mark read", { spaceId }, error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <SpaceHeader
        space={space}
        tabs={tabs}
        activeTab={tab}
        joined={membership !== null}
        canJoin={canJoin}
        isFavorite={Boolean(membership?.favoritedAt)}
        isHost={membership?.role === "HOST"}
      />

      {/* Pinned resources: the things you keep coming back for. Distinct from a
          pinned post, which is a conversation. */}
      {space.resources.length > 0 ? (
        <section className="rounded-card border border-border/70 bg-surface p-4">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            <Pin className="size-3" aria-hidden />
            Pinned in this space
          </h2>
          <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {space.resources.map((resource) => (
              <li key={resource.id}>
                <a
                  href={resource.url}
                  target={resource.url.startsWith("http") ? "_blank" : undefined}
                  rel={resource.url.startsWith("http") ? "noreferrer" : undefined}
                  className="flex items-start gap-2.5 rounded-ctl border border-border/70 px-3 py-2.5 no-underline transition hover:border-brand/50 hover:bg-mint/40"
                >
                  <ExternalLink
                    className="mt-0.5 size-4 shrink-0 text-brand"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-bold text-foreground">
                      {resource.label}
                    </span>
                    {resource.description ? (
                      <span className="block truncate text-[12.5px] text-foreground-muted">
                        {resource.description}
                      </span>
                    ) : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "feed" ? (
        <SpaceFeed
          space={space}
          sort={sort}
          userId={session.user.id}
          joined={membership !== null}
          viewer={{
            name: session.user.name || session.user.handle,
            avatar: session.user.image ?? null,
          }}
          isStaff={session.user.roles.some(
            (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "HOST",
          )}
        />
      ) : null}

      {tab === "events" ? <SpaceEvents spaceId={space.id} /> : null}
      {tab === "courses" ? <SpaceCourses spaceId={space.id} /> : null}
      {tab === "members" ? <SpaceMembers spaceId={space.id} /> : null}
      {tab === "about" ? <SpaceAbout space={space} kind={kind} /> : null}
    </div>
  );
}

async function SpaceFeed({
  space,
  sort,
  userId,
  joined,
  viewer,
  isStaff,
}: {
  space: { id: string; slug: string; name: string };
  sort: ReturnType<typeof parseFeedSort>;
  userId: string;
  joined: boolean;
  viewer: { name: string; avatar: string | null };
  isStaff: boolean;
}) {
  const { posts } = await listFeed({ userId, spaceId: space.id, sort, take: 40 });

  return (
    <>
      {joined ? (
        <FeedComposer
          name={viewer.name}
          avatar={viewer.avatar}
          spaces={[{ id: space.id, name: space.name, slug: space.slug }]}
          defaultSpaceId={space.id}
          uploadsEnabled={uploadsConfigured()}
        />
      ) : (
        <p className="rounded-card border border-border/70 bg-surface px-4 py-3 text-[14px] text-foreground-muted">
          Join this space to post in it.
        </p>
      )}

      <div className="border-b border-border/70">
        <FeedSortBar current={sort} basePath={`/spaces/${space.slug}`} />
      </div>

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Be the first to put something on this table."
          actionLabel="Write a post"
          actionHref="/compose"
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} viewer={viewer} canPin={isStaff} />
          ))}
        </div>
      )}
    </>
  );
}

async function SpaceEvents({ spaceId }: { spaceId: string }) {
  const events = await prisma.event.findMany({
    where: { spaceId },
    orderBy: { startsAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      _count: { select: { rsvps: true } },
    },
  });

  if (events.length === 0) {
    return (
      <EmptyState
        title="No classes scheduled"
        body="Live cook-alongs for this space will appear here."
        actionLabel="See the calendar"
        actionHref="/calendar"
      />
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href="/calendar"
            className="flex gap-3 rounded-card border border-border/70 bg-surface p-4 no-underline transition hover:border-brand/40"
          >
            <span
              className="grid size-12 shrink-0 place-items-center rounded-ctl bg-brand-wash text-center"
              aria-hidden
            >
              <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-strong">
                {event.startsAt.toLocaleString("en-US", { month: "short" })}
              </span>
              <span className="block text-base font-bold leading-none text-brand-strong">
                {event.startsAt.getDate()}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-foreground">
                {event.title}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-foreground-muted">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {event.startsAt.toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {event._count.rsvps > 0 ? <span>· {event._count.rsvps} going</span> : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function SpaceCourses({ spaceId }: { spaceId: string }) {
  const courses = await prisma.course.findMany({
    where: { spaceId },
    orderBy: { catalogOrder: "asc" },
    select: { slug: true, title: true, description: true, coverUrl: true },
  });

  if (courses.length === 0) {
    return (
      <EmptyState
        title="No lessons in this space"
        body="Course content assigned to this space will appear here."
        actionLabel="Browse the library"
        actionHref="/learn"
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {courses.map((course) => (
        <Link
          key={course.slug}
          href={`/learn/${course.slug}`}
          className="overflow-hidden rounded-card border border-border/70 bg-surface no-underline transition hover:border-brand/40"
        >
          {course.coverUrl ? (
            <span className="block aspect-[16/10] overflow-hidden bg-mint">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={course.coverUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </span>
          ) : null}
          <span className="block p-4">
            <span className="block text-[15px] font-bold text-foreground">
              {course.title}
            </span>
            {course.description ? (
              <span className="mt-1 block line-clamp-2 text-[13.5px] leading-snug text-foreground-muted">
                {course.description}
              </span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

async function SpaceMembers({ spaceId }: { spaceId: string }) {
  const members = await prisma.spaceMembership.findMany({
    where: { spaceId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    take: 60,
    select: {
      role: true,
      createdAt: true,
      user: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true, bio: true } },
        },
      },
    },
  });

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {members.map((member) => (
        <li key={member.user.handle}>
          <Link
            href={`/members/${member.user.handle}`}
            className="flex items-center gap-3 rounded-card border border-border/70 bg-surface p-3.5 no-underline transition hover:border-brand/40"
          >
            <Avatar
              name={member.user.profile?.displayName ?? member.user.handle}
              src={member.user.profile?.avatarUrl}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate text-[14.5px] font-bold text-foreground">
                  {member.user.profile?.displayName ?? member.user.handle}
                </span>
                {member.role !== "MEMBER" ? (
                  <span className="shrink-0 rounded-full bg-brand-wash px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em] text-brand-strong">
                    {member.role.toLowerCase()}
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-[12.5px] text-foreground-muted">
                {member.user.profile?.bio ?? `Joined ${formatShortTime(member.createdAt)}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SpaceAbout({
  space,
  kind,
}: {
  space: {
    description: string | null;
    visibility: string;
    postingPermission: string;
    approvalRequired: boolean;
    _count: { memberships: number; posts: number };
  };
  kind: SpaceKind;
}) {
  return (
    <div className="space-y-3">
      <section className="rounded-card border border-border/70 bg-surface p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
          What this space is for
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground">
          {space.description ?? SPACE_KIND_BLURB[kind]}
        </p>
        <p className="mt-1.5 text-[13.5px] text-foreground-muted">
          {SPACE_KIND_LABEL[kind]} space — {SPACE_KIND_BLURB[kind]}.
        </p>
      </section>

      <section className="rounded-card border border-border/70 bg-surface p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
          How it works
        </h2>
        <dl className="mt-3 space-y-2.5 text-[14px]">
          <Row
            label="Who can see it"
            value={
              space.visibility === "PRIVATE"
                ? "Members of this space only"
                : space.visibility === "PUBLIC"
                  ? "Anyone who can reach the school"
                  : "Any member of the school"
            }
            icon={space.visibility === "PRIVATE" ? <Lock className="size-3.5" /> : undefined}
          />
          <Row
            label="Who can post"
            value={
              space.postingPermission === "HOSTS_ONLY"
                ? "Hosts and moderators"
                : space.postingPermission === "APPROVAL_REQUIRED"
                  ? "Any member, with host approval"
                  : "Any member of this space"
            }
          />
          {space.approvalRequired ? (
            <Row label="Joining" value="A host approves new members" />
          ) : null}
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        {icon}
        {value}
      </dd>
    </div>
  );
}
