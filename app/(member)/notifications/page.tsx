import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationCategory } from "@prisma/client";
import {
  AtSign,
  BellRing,
  CalendarClock,
  CheckCheck,
  Info,
  Mail,
  Megaphone,
  MessageSquare,
  Newspaper,
  Reply,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatShortTime } from "@/lib/community/format-count";
import {
  PREF_ROWS,
  UNSWITCHABLE,
  parsePrefs,
  wants,
} from "@/lib/notifications/preferences";
import {
  markAllReadAction,
  markOneReadAction,
  setPreferenceAction,
} from "@/app/(member)/notifications/actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

/** The filters across the top, each mapping to one or more categories. */
const FILTERS: {
  value: string;
  label: string;
  categories?: NotificationCategory[];
  unreadOnly?: boolean;
}[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread", unreadOnly: true },
  { value: "mentions", label: "Mentions", categories: ["MENTIONS"] },
  { value: "replies", label: "Replies", categories: ["REPLIES", "DMS"] },
  { value: "events", label: "Events", categories: ["EVENTS"] },
  {
    value: "system",
    label: "System",
    categories: ["SYSTEM", "HOST_ANNOUNCEMENTS", "DIGESTS"],
  },
];

const ICONS: Record<NotificationCategory, typeof BellRing> = {
  REPLIES: Reply,
  MENTIONS: AtSign,
  DMS: MessageSquare,
  SPACE_ACTIVITY: Users,
  EVENTS: CalendarClock,
  HOST_ANNOUNCEMENTS: Megaphone,
  DIGESTS: Newspaper,
  SYSTEM: Info,
};

/**
 * The notification inbox.
 *
 * One place for social activity, host announcements and system notices, with
 * filters rather than separate pages, and preferences that the delivery path
 * actually honours.
 *
 * Nothing is marked read by rendering. The old page called
 * `markNotificationsRead` during render, so glancing at the inbox wiped the
 * unread state it was supposed to be showing. Reading is now something you do:
 * opening a notification, or pressing "Mark all read".
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const requested = (await searchParams).filter;
  const filter = FILTERS.find((item) => item.value === requested) ?? FILTERS[0];

  const [notifications, unreadCount, profile] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(filter.unreadOnly ? { readAt: null } : {}),
        ...(filter.categories ? { category: { in: filter.categories } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { notificationPrefs: true },
    }),
  ]);

  const prefs = parsePrefs(profile?.notificationPrefs);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-forest md:text-[2rem]">
            Notifications
          </h1>
          <p className="mt-1.5 text-[15px] text-foreground-muted">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : "Everything here has been read."}
          </p>
        </div>
        {unreadCount > 0 ? (
          <form action={markAllReadAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-[13.5px] font-bold text-foreground transition hover:border-brand/50 hover:text-brand"
            >
              <CheckCheck className="size-4" aria-hidden />
              Mark all read
            </button>
          </form>
        ) : null}
      </header>

      <nav
        aria-label="Filter notifications"
        className="flex items-stretch gap-1 overflow-x-auto border-b border-border/70"
      >
        {FILTERS.map((item) => {
          const active = filter.value === item.value;
          return (
            <Link
              key={item.value}
              href={`/notifications?filter=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/tab relative inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5",
                "text-[14px] font-bold no-underline transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                active ? "text-brand" : "text-foreground-muted hover:text-foreground",
              )}
            >
              {item.label}
              {item.value === "unread" && unreadCount > 0 ? (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10.5px] font-bold tabular-nums text-[#06120d]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
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

      {notifications.length === 0 ? (
        <div className="rounded-card border border-border/70 bg-surface p-8 text-center">
          <BellRing className="mx-auto size-6 text-foreground-muted" aria-hidden />
          <p className="mt-3 text-[15px] font-bold text-foreground">
            {filter.unreadOnly ? "Nothing unread" : "Nothing here yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed text-foreground-muted">
            {filter.value === "all"
              ? "Replies, mentions and event reminders land here."
              : "Try another filter, or check back after the next cook-along."}
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border/70 bg-surface">
          {notifications.map((item) => {
            const Icon = ICONS[item.category] ?? BellRing;
            const unread = !item.readAt;
            return (
              <li
                key={item.id}
                className={cn(
                  "relative flex gap-3 border-b border-border/60 p-4 last:border-b-0 transition-colors",
                  unread ? "bg-brand-wash/40" : "hover:bg-mint/40",
                )}
              >
                {unread ? (
                  <span
                    className="absolute left-0 top-0 h-full w-[3px] bg-brand"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full",
                    unread ? "bg-brand text-[#06120d]" : "bg-mint text-foreground-muted",
                  )}
                  aria-hidden
                >
                  <Icon className="size-[1.05rem]" />
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={item.href ?? "/notifications"}
                    className="block no-underline"
                  >
                    <p
                      className={cn(
                        "text-[14.5px] leading-snug",
                        unread
                          ? "font-bold text-foreground"
                          : "font-semibold text-foreground",
                      )}
                    >
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-foreground-muted">
                      {item.body}
                    </p>
                  </Link>
                  <p className="mt-1 text-[12px] text-foreground-muted">
                    {formatShortTime(item.createdAt)}
                  </p>
                </div>

                {unread ? (
                  <form action={markOneReadAction} className="shrink-0 self-start">
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      title="Mark read"
                      aria-label={`Mark "${item.title}" read`}
                      className="grid size-8 place-items-center rounded-full text-foreground-muted transition hover:bg-surface hover:text-brand"
                    >
                      <CheckCheck className="size-4" aria-hidden />
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Preferences. Inline rather than buried in /settings, because the
          moment you want them is the moment something noisy arrived. */}
      <section className="rounded-card border border-border/70 bg-surface">
        <div className="border-b border-border/60 px-4 py-3">
          <h2 className="text-[14.5px] font-bold text-foreground">
            What reaches you
          </h2>
          <p className="mt-0.5 text-[13px] text-foreground-muted">
            In-app is the bell above. Email needs a sending address configured
            before it delivers.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
          <span />
          <span className="flex items-center gap-1">
            <BellRing className="size-3" aria-hidden /> In app
          </span>
          <span className="flex items-center gap-1">
            <Mail className="size-3" aria-hidden /> Email
          </span>
        </div>

        <ul>
          {PREF_ROWS.map((row) => (
            <li
              key={row.category}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-border/60 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-foreground">
                  {row.label}
                </p>
                <p className="text-[12.5px] text-foreground-muted">{row.hint}</p>
              </div>
              <Toggle
                channel="inApp"
                category={row.category}
                on={wants(prefs, "inApp", row.category)}
                label={`${row.label} in app`}
              />
              <Toggle
                channel="email"
                category={row.category}
                on={wants(prefs, "email", row.category)}
                label={`${row.label} by email`}
              />
            </li>
          ))}
          <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-t border-border/60 px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold text-foreground">
                Account and billing
              </p>
              <p className="text-[12.5px] text-foreground-muted">
                Always sent — these are not optional.
              </p>
            </div>
            <span className="text-[12px] font-bold text-foreground-muted">
              Always on
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

/**
 * A preference switch. A form button rather than a checkbox, so it works
 * without JavaScript and each flip is one server action.
 */
function Toggle({
  channel,
  category,
  on,
  label,
}: {
  channel: "inApp" | "email";
  category: NotificationCategory;
  on: boolean;
  label: string;
}) {
  if (UNSWITCHABLE.includes(category)) return <span />;
  return (
    <form action={setPreferenceAction}>
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="on" value={String(!on)} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={cn(
          "relative h-6 w-10 rounded-full transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          on ? "bg-brand" : "bg-border",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-surface shadow-e1 transition-[left]",
            on ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </button>
    </form>
  );
}
