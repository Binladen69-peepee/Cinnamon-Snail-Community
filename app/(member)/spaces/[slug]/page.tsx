import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { CalendarDays, Lock } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { parseFeedSort } from "@/lib/community/sort";
import { formatShortTime } from "@/lib/community/format-count";
import { getSpaceForMember, markSpaceRead, type SpaceKind } from "@/lib/spaces";
import { tabsForKind } from "@/lib/spaces/kinds";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { Composer } from "@/components/feed/composer";
import { FeedToolbar, type Density } from "@/components/feed/feed-toolbar";
import { PostCard } from "@/components/feed/post-card";
import { SpaceHeader, type SpaceTab } from "@/components/spaces/space-header";
import { PinnedResources, SpaceRail } from "@/components/spaces/space-rail";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";

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
  const density = await readDensity();

  const result = await getSpaceForMember(session.user.id, slug);
  if (!result) notFound();
  const { space, membership, canEnter, canJoin, canDiscover } = result;

  // A private space is unlisted, not merely locked: someone who cannot discover
  // it gets a 404 rather than confirmation that it exists.
  if (!canDiscover) notFound();

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

  const hosts = await prisma.spaceMembership.findMany({
    where: { spaceId: space.id, role: { in: ["HOST", "MODERATOR"] } },
    take: 5,
    select: {
      role: true,
      user: {
        select: {
          handle: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
  });

  const header = (
    <SpaceHeader
      space={space}
      tabs={tabs}
      activeTab={tab}
      joined={membership !== null}
      canJoin={canJoin}
      isFavorite={Boolean(membership?.favoritedAt)}
      isHost={membership?.role === "HOST"}
    />
  );

  // Someone who can see the room but not enter it gets the header and a reason,
  // not a bare 403 — the header is what tells them who to ask.
  if (!canEnter) {
    return (
      <AppShell>
        <div className="space-y-2.5">
          {header}
          <div className="rounded-card border border-border bg-surface px-6 py-10 text-center">
            <Lock className="mx-auto size-5 text-foreground-muted" aria-hidden />
            <p className="mt-3 text-[15px] font-bold text-foreground">
              This room is private
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed text-foreground-muted">
              A host adds members here. Ask{" "}
              {space.host?.profile?.displayName ?? "a host"} if you think you
              should be in it.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Clearing unread happens after the response, never during render: a page must
  // not wipe the state it is displaying. Calling the domain function directly
  // rather than a server action — an action re-checks auth and revalidates,
  // neither of which works inside after().
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
    <AppShell
      rail={
        <SpaceRail
          space={space}
          resources={space.resources}
          members={hosts.map((row) => ({
            handle: row.user.handle,
            role: row.role,
            profile: row.user.profile,
          }))}
        />
      }
    >
      <div className="space-y-2.5">
        {header}
        <PinnedResources resources={space.resources} />

        {tab === "feed" ? (
          <SpaceFeed
            space={space}
            sort={sort}
            density={density}
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
    </AppShell>
  );
}

async function readDensity(): Promise<Density> {
  const store = await cookies();
  return store.get("vu-density")?.value === "compact" ? "compact" : "card";
}

async function SpaceFeed({
  space,
  sort,
  density,
  userId,
  joined,
  viewer,
  isStaff,
}: {
  space: { id: string; slug: string; name: string };
  sort: ReturnType<typeof parseFeedSort>;
  density: Density;
  userId: string;
  joined: boolean;
  viewer: { name: string; avatar: string | null };
  isStaff: boolean;
}) {
  const { posts } = await listFeed({ userId, spaceId: space.id, sort, take: 40 });

  return (
    <>
      {joined ? (
        <Composer
          name={viewer.name}
          avatar={viewer.avatar}
          spaces={[{ id: space.id, name: space.name, slug: space.slug }]}
          defaultSpaceId={space.id}
          uploadsEnabled={uploadsConfigured()}
        />
      ) : (
        <p className="rounded-card border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground-muted">
          Join this room to post in it.
        </p>
      )}

      <FeedToolbar sort={sort} basePath={`/spaces/${space.slug}`} density={density} />

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Be the first to put something on this table."
          actionLabel="Write a post"
          actionHref="/compose"
        />
      ) : (
        <div className="space-y-2.5">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              viewer={viewer}
              density={density}
              canPin={isStaff}
              // The space is already the page; repeating it on every card is
              // noise.
              showSpace={false}
            />
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
      startsAt: true,
      _count: { select: { rsvps: true } },
    },
  });

  if (events.length === 0) {
    return (
      <EmptyState
        title="No classes scheduled"
        body="Live cook-alongs for this room will appear here."
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
            className="flex gap-2.5 rounded-card border border-border bg-surface p-3 no-underline transition hover:border-hairline-firm"
          >
            <span
              className="grid size-10 shrink-0 place-items-center rounded-ctl bg-brand-wash text-center"
              aria-hidden
            >
              <span className="block text-[9px] font-bold uppercase tracking-wider text-brand-strong">
                {event.startsAt.toLocaleString("en-US", { month: "short" })}
              </span>
              <span className="block text-[14px] font-bold leading-none text-brand-strong">
                {event.startsAt.getDate()}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-foreground">
                {event.title}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-foreground-muted">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" aria-hidden />
                  {event.startsAt.toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {event._count.rsvps > 0 ? (
                  <span>· {event._count.rsvps} going</span>
                ) : null}
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
    select: { slug: true, title: true, description: true },
  });

  if (courses.length === 0) {
    return (
      <EmptyState
        title="No lessons in this room"
        body="Course content assigned to this space will appear here."
        actionLabel="Browse the library"
        actionHref="/learn"
      />
    );
  }

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {courses.map((course) => (
        <li key={course.slug}>
          <Link
            href={`/learn/${course.slug}`}
            className="block h-full rounded-card border border-border bg-surface p-3 no-underline transition hover:border-hairline-firm"
          >
            <span className="block text-[14px] font-bold text-foreground">
              {course.title}
            </span>
            {course.description ? (
              <span className="mt-1 block line-clamp-2 text-[12.5px] leading-snug text-foreground-muted">
                {course.description}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
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
            className="flex items-center gap-2.5 rounded-card border border-border bg-surface p-2.5 no-underline transition hover:border-hairline-firm"
          >
            <Avatar
              name={member.user.profile?.displayName ?? member.user.handle}
              src={member.user.profile?.avatarUrl}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate text-[13.5px] font-bold text-foreground">
                  {member.user.profile?.displayName ?? member.user.handle}
                </span>
                {member.role !== "MEMBER" ? (
                  <span className="shrink-0 rounded-full bg-brand-wash px-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-brand-strong">
                    {member.role.toLowerCase()}
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-[11.5px] text-foreground-muted">
                {member.user.profile?.bio ??
                  `Joined ${formatShortTime(member.createdAt)}`}
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
    name: string;
    description: string | null;
    visibility: string;
    postingPermission: string;
    approvalRequired: boolean;
    _count: { memberships: number; posts: number };
  };
  kind: SpaceKind;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        About {space.name}
      </h2>
      <p className="mt-2 text-[14.5px] leading-relaxed text-foreground">
        {space.description ?? "A room for plates and questions."}
      </p>

      <dl className="mt-4 space-y-2.5 border-t border-border pt-3 text-[13.5px]">
        <AboutRow
          label="Who can see it"
          value={
            space.visibility === "PRIVATE"
              ? "Members of this room only"
              : space.visibility === "PUBLIC"
                ? "Anyone who can reach the school"
                : "Any member of the school"
          }
        />
        <AboutRow
          label="Who can post"
          value={
            space.postingPermission === "HOSTS_ONLY"
              ? "Hosts and moderators"
              : space.postingPermission === "APPROVAL_REQUIRED"
                ? "Any member, with host approval"
                : "Any member of this room"
          }
        />
        <AboutRow
          label="Joining"
          value={
            space.visibility === "PRIVATE"
              ? "A host adds you"
              : space.approvalRequired
                ? "A host approves new members"
                : "Open — join yourself"
          }
        />
        <AboutRow label="Kind" value={kind.toLowerCase()} />
      </dl>
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-bold capitalize text-foreground">{value}</dd>
    </div>
  );
}
