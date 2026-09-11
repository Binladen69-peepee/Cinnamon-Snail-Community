import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { listPublishedCourses } from "@/lib/learn/catalog";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Discover" };

const TABS = [
  { value: "people", label: "People" },
  { value: "spaces", label: "Spaces" },
  { value: "courses", label: "Courses" },
  { value: "events", label: "Events" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/**
 * Discover: one place to find people, spaces, courses and events.
 *
 * The blueprint makes this a primary destination, and it is the answer to the
 * rail's "Browse" links — without it, everything a member has not already
 * joined is only reachable through search. Tabs rather than four separate
 * routes, so moving between them keeps the page.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some((item) => item.value === requested)
    ? (requested as Tab)
    : "people";

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-forest md:text-[2rem]">
          Discover
        </h1>
        <p className="mt-1.5 text-[15px] text-foreground-muted">
          Everyone and everything in the school, in one place.
        </p>
      </header>

      <nav
        aria-label="Discover sections"
        className="flex items-stretch gap-1 overflow-x-auto border-b border-border/70"
      >
        {TABS.map((item) => {
          const active = tab === item.value;
          return (
            <Link
              key={item.value}
              href={`/discover?tab=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/tab relative inline-flex shrink-0 items-center px-3 pb-2.5 pt-1.5",
                "text-[14px] font-bold no-underline transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                active ? "text-brand" : "text-foreground-muted hover:text-foreground",
              )}
            >
              {item.label}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-1.5 -bottom-px h-0.75 rounded-full transition-opacity",
                  active
                    ? "bg-brand opacity-100"
                    : "bg-foreground/25 opacity-0 group-hover/tab:opacity-100",
                )}
              />
            </Link>
          );
        })}
      </nav>

      {tab === "people" ? <People userId={session.user.id} /> : null}
      {tab === "spaces" ? <Spaces /> : null}
      {tab === "courses" ? <Courses /> : null}
      {tab === "events" ? <Events /> : null}
    </div>
  );
}

async function People({ userId }: { userId: string }) {
  const [suggested, members] = await Promise.all([
    peopleYouShouldMeet(userId, 6),
    prisma.user.findMany({
      where: { deletedAt: null, status: { not: "DELETED" }, id: { not: userId } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true,
        handle: true,
        profile: { select: { displayName: true, avatarUrl: true, bio: true } },
      },
    }),
  ]);

  const suggestedIds = new Set(suggested.map((person) => person.userId));
  // In a small community everybody can end up in "suggested", which left an
  // "Everyone else" heading standing over an empty grid.
  const rest = members.filter((member) => !suggestedIds.has(member.id));

  return (
    <div className="space-y-6">
      {suggested.length > 0 ? (
        <Group title="Suggested for you" hint="Matched on what you cook and where you overlap">
          {suggested.map((person) => (
            <PersonCard
              key={person.userId}
              handle={person.handle}
              name={person.displayName}
              avatar={person.avatarUrl}
              line={person.reason}
              highlight
            />
          ))}
        </Group>
      ) : null}

      {rest.length > 0 ? (
        <Group title="Everyone else">
          {rest.map((member) => (
            <PersonCard
              key={member.id}
              handle={member.handle}
              name={member.profile?.displayName ?? member.handle}
              avatar={member.profile?.avatarUrl ?? null}
              line={member.profile?.bio ?? `@${member.handle}`}
            />
          ))}
        </Group>
      ) : null}

      {suggested.length === 0 && rest.length === 0 ? (
        <p className="rounded-card border border-border/70 bg-surface p-6 text-[14px] text-foreground-muted">
          You are the first one here. Members will appear as they join.
        </p>
      ) : null}
    </div>
  );
}

async function Spaces() {
  const spaces = await prisma.space.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      name: true,
      slug: true,
      description: true,
      coverUrl: true,
      _count: { select: { memberships: true, posts: true } },
    },
  });

  return (
    <Group title="All spaces">
      {spaces.map((space) => (
        <Link
          key={space.slug}
          href={`/spaces/${space.slug}`}
          className="flex gap-3 rounded-card border border-border/70 bg-surface p-4 no-underline transition hover:border-brand/40"
        >
          <Avatar name={space.name} src={space.coverUrl} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-foreground">
              {space.name}
            </span>
            <span className="mt-0.5 block line-clamp-2 text-[13.5px] leading-snug text-foreground-muted">
              {space.description ?? "A room for plates and questions."}
            </span>
            <span className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground-muted">
              <Users className="size-3.5" aria-hidden />
              {space._count.memberships} members · {space._count.posts} posts
            </span>
          </span>
        </Link>
      ))}
    </Group>
  );
}

async function Courses() {
  const courses = await listPublishedCourses();
  return (
    <Group title="The class library">
      {courses.map((course) => (
        <Link
          key={course.slug}
          href={`/learn/${course.slug}`}
          className="overflow-hidden rounded-card border border-border/70 bg-surface no-underline transition hover:border-brand/40"
        >
          {course.coverUrl ? (
            <span className="block aspect-[16/10] overflow-hidden bg-mint">
              {/* Catalog art is an arbitrary host, not an optimizer input. */}
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
    </Group>
  );
}

/**
 * Anything that started within the last two hours still counts as coming up, so
 * a class in progress does not vanish from the list the moment it begins.
 *
 * Kept out of the component so the clock is not read during render.
 */
function recentlyStarted(): Date {
  return new Date(Date.now() - 2 * 60 * 60 * 1000);
}

async function Events() {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: recentlyStarted() } },
    orderBy: { startsAt: "asc" },
    take: 24,
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      space: { select: { name: true } },
      _count: { select: { rsvps: true } },
    },
  });

  if (events.length === 0) {
    return (
      <p className="rounded-card border border-border/70 bg-surface p-6 text-[14px] text-foreground-muted">
        No classes on the calendar yet. The next cook-along will show up here.
      </p>
    );
  }

  return (
    <Group title="Coming up">
      {events.map((event) => (
        <Link
          key={event.id}
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
              {event.space ? <span>· {event.space.name}</span> : null}
              {event._count.rsvps > 0 ? <span>· {event._count.rsvps} going</span> : null}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 self-center text-foreground-muted" aria-hidden />
        </Link>
      ))}
    </Group>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-[13px] text-foreground-muted">{hint}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function PersonCard({
  handle,
  name,
  avatar,
  line,
  highlight,
}: {
  handle: string;
  name: string;
  avatar: string | null;
  line: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={`/members/${handle}`}
      className={cn(
        "flex items-center gap-3 rounded-card border bg-surface p-4 no-underline transition",
        highlight
          ? "border-brand/30 hover:border-brand/60"
          : "border-border/70 hover:border-brand/40",
      )}
    >
      <Avatar name={name} src={avatar} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-bold text-foreground">
          {name}
        </span>
        {/* The reason is the feature — a directory row without one is a list of
            strangers. */}
        <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-snug text-foreground-muted">
          {line}
        </span>
      </span>
    </Link>
  );
}
