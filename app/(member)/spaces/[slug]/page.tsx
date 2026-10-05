import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { BookOpen, CalendarDays, Lock, MessageSquare, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { toFeedCard } from "@/lib/community/feed-card";
import { parseFeedSort } from "@/lib/community/sort";
import { formatShortTime } from "@/lib/community/format-count";
import { getSpaceForMember, markSpaceRead, type SpaceKind } from "@/lib/spaces";
import { tabsForKind } from "@/lib/spaces/kinds";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { Composer } from "@/components/feed/composer";
import { FeedToolbar, type Density } from "@/components/feed/feed-toolbar";
import { PostCard } from "@/components/feed/post-card";
import { FeedStream } from "@/components/feed/feed-stream";
import { SpaceHeader, type SpaceTab } from "@/components/spaces/space-header";
import { PinnedResources, SpaceRail } from "@/components/spaces/space-rail";
import { SpaceTools } from "@/components/spaces/space-tools";
import { Avatar } from "@/components/ui/avatar";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  cardClass,
} from "@/components/app/ui";

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
  const { space, membership, canEnter, canJoin, canDiscover, canManage, lockedByProduct } =
    result;

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

  const canModerate =
    membership?.role === "HOST" ||
    membership?.role === "MODERATOR" ||
    session.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN");

  // Only asked for by someone who can answer the queue.
  const pendingCount = canModerate
    ? await prisma.post.count({ where: { spaceId: space.id, status: "PENDING" } })
    : 0;

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

  const headerProps = {
    space,
    tabs,
    activeTab: tab,
    joined: membership !== null,
    canJoin,
    isFavorite: Boolean(membership?.favoritedAt),
    isHost: membership?.role === "HOST",
  };

  // Someone who can see the room but not enter it gets the header and a reason,
  // not a bare 403 — the header is what tells them who to ask. The reason
  // matters: a room you need to be invited to and a room you need to buy into
  // send you to two different places.
  if (!canEnter) {
    return (
      <AppShell>
        <div className="flex flex-col gap-6">
          <SpaceHeader {...headerProps} />
          <EmptyState
            icon={<Lock />}
            title={lockedByProduct ? "This room comes with a membership" : "This room is private"}
            description={
              lockedByProduct ? (
                space.product?.name
                  ? `It is included with ${space.product.name}.`
                  : "It is included with a paid membership."
              ) : (
                <>
                  A host adds members here. Ask{" "}
                  {space.host?.profile?.displayName ?? "a host"} if you think you
                  should be in it.
                </>
              )
            }
            action={
              lockedByProduct ? (
                <ButtonLink href="/membership" variant="primary">
                  See what is included
                </ButtonLink>
              ) : undefined
            }
          />
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
      <div className="flex flex-col gap-6">
        <SpaceHeader
          {...headerProps}
          tools={
            <SpaceTools
              spaceId={space.id}
              slug={space.slug}
              joined={membership !== null}
              level={membership?.notificationLevel ?? null}
              canManage={canManage}
              canModerate={canModerate}
              pendingCount={pendingCount}
            />
          }
        />
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
              handle: session.user.handle,
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
  viewer: { name: string; avatar: string | null; handle?: string };
  isStaff: boolean;
}) {
  const feed = await listFeed({ userId, spaceId: space.id, sort, take: 20 });

  return (
    <div className="flex flex-col gap-3">
      {joined ? (
        <Composer
          name={viewer.name}
          avatar={viewer.avatar}
          spaces={[{ id: space.id, name: space.name, slug: space.slug }]}
          defaultSpaceId={space.id}
          uploadsEnabled={uploadsConfigured()}
        />
      ) : (
        <Callout tone="neutral">Join this room to post in it.</Callout>
      )}

      <FeedToolbar sort={sort} basePath={`/spaces/${space.slug}`} density={density} />

      {feed.pinned.length > 0 ? (
        <div className="flex flex-col gap-3">
          {feed.pinned.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              viewer={viewer}
              density={density}
              canPin={isStaff}
              showSpace={false}
            />
          ))}
        </div>
      ) : null}

      <FeedStream
        key={sort}
        initialPosts={feed.posts.map(toFeedCard)}
        initialCursor={feed.nextCursor}
        sort={sort}
        spaceSlug={space.slug}
        viewer={{ ...viewer, handle: viewer.handle ?? "" }}
        density={density}
        canPin={isStaff}
        emptyState={
          feed.pinned.length > 0 ? null : (
            <EmptyState
              icon={<MessageSquare />}
              title="Nothing here yet"
              description="Be the first to put something on this table."
              action={
                <ButtonLink href="/compose" variant="primary">
                  Write a post
                </ButtonLink>
              }
            />
          )
        }
      />
    </div>
  );
}

async function SpaceEvents({ spaceId }: { spaceId: string }) {
  const events = await prisma.event.findMany({
    where: { spaceId },
    orderBy: { startsAt: "desc" },
    take: 30,
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      _count: { select: { rsvps: true } },
    },
  });

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="No classes scheduled"
        description="Live cook-alongs for this room will appear here."
        action={
          <ButtonLink href="/calendar" variant="primary">
            See the calendar
          </ButtonLink>
        }
      />
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-separator">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/calendar/${event.slug}`}
              className="flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5"
            >
              <span
                className="grid size-11 shrink-0 place-content-center rounded-ctl bg-brand-wash text-center text-on-brand-wash"
                aria-hidden
              >
                <span className="block text-micro font-semibold uppercase leading-none tracking-[0.08em]">
                  {event.startsAt.toLocaleString("en-US", { month: "short" })}
                </span>
                <span className="mt-0.5 block text-title font-semibold leading-none tabular-nums">
                  {event.startsAt.getDate()}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-foreground">
                  {event.title}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-foreground-muted">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" aria-hidden />
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
    </Card>
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
        icon={<BookOpen />}
        title="No lessons in this room"
        description="Course content assigned to this space will appear here."
        action={
          <ButtonLink href="/learn" variant="primary">
            Browse the library
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {courses.map((course) => (
        <li key={course.slug}>
          <Link
            href={`/learn/${course.slug}`}
            className={cardClass({
              interactive: true,
              className: "flex h-full gap-3 no-underline",
            })}
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-ctl bg-brand-wash text-on-brand-wash"
              aria-hidden
            >
              <BookOpen className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-semibold text-foreground">
                {course.title}
              </span>
              {course.description ? (
                <span className="mt-1 block line-clamp-2 text-label text-foreground-muted">
                  {course.description}
                </span>
              ) : null}
            </span>
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

  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No members yet"
        description="People who join this room will appear here."
        action={<ButtonLink href="/members">Browse members</ButtonLink>}
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {members.map((member) => (
        <li key={member.user.handle}>
          <Link
            href={`/members/${member.user.handle}`}
            className={cardClass({
              padding: "sm",
              interactive: true,
              className: "flex h-full items-center gap-3 no-underline",
            })}
          >
            <Avatar
              name={member.user.profile?.displayName ?? member.user.handle}
              src={member.user.profile?.avatarUrl}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate text-body font-semibold text-foreground">
                  {member.user.profile?.displayName ?? member.user.handle}
                </span>
                {member.role !== "MEMBER" ? (
                  <Badge tone="brand" className="capitalize">
                    {member.role.toLowerCase()}
                  </Badge>
                ) : null}
              </span>
              <span className="block truncate text-caption text-foreground-muted">
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
    <Card padding="none">
      <CardHeader title={`About ${space.name}`} />
      <div className="px-4 pb-2 pt-4 sm:px-5">
        <p className="text-reading text-foreground text-pretty">
          {space.description ?? "A room for plates and questions."}
        </p>

        <dl className="mt-3 divide-y divide-separator text-body">
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
          <AboutRow label="Kind" value={kind.toLowerCase()} capitalize />
        </dl>
      </div>
    </Card>
  );
}

function AboutRow({
  label,
  value,
  capitalize = false,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className={capitalize ? "font-medium capitalize text-foreground" : "font-medium text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
