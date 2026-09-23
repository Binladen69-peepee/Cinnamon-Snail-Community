import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AtSign,
  Bell,
  BellOff,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  Reply,
  Settings2,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { NotificationCategory } from "@prisma/client";
import { auth } from "@/auth";
import {
  INBOX_FILTERS,
  INBOX_FILTER_LABEL,
  loadInbox,
  parseInboxFilter,
  type InboxFilter,
} from "@/lib/notifications/inbox";
import { formatShortTime } from "@/lib/community/format-count";
import { AppShell } from "@/components/app/app-shell";
import {
  markAllReadAction,
  openNotificationAction,
} from "@/app/(member)/notifications/actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  REPLIES: Reply,
  MENTIONS: AtSign,
  DMS: MessageSquare,
  SPACE_ACTIVITY: Users,
  EVENTS: CalendarDays,
  HOST_ANNOUNCEMENTS: Bell,
  DIGESTS: Bell,
  SYSTEM: ShieldAlert,
};

/**
 * The notification inbox.
 *
 * The bell in the header has been carrying a live unread count on every page,
 * and clicking it 404'd. This is the page it was counting for.
 *
 * Built to DEC-028, whose central ruling is a negative one: **this page does
 * not mark anything read by rendering.** The previous inbox called
 * `markNotificationsRead` during render, so glancing at it destroyed the unread
 * state it existed to show. Reading is an action — opening one, or pressing
 * Mark all read — and both live in server actions rather than here.
 *
 * Each row is a form rather than a link so the read lands without JavaScript
 * and cannot be lost by a tab closing before a beacon fires.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const filter = parseInboxFilter(params.filter);
  const data = await loadInbox({ userId: session.user.id, filter });

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              Notifications
            </h1>
            <p className="mt-1 text-[14px] text-foreground-muted">
              {data.unread > 0
                ? `${data.unread} unread`
                : "You are all caught up."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="vu-btn vu-btn-secondary inline-flex h-9 items-center gap-1.5 px-3 text-[13px] no-underline"
            >
              <Settings2 className="size-4" aria-hidden />
              Preferences
            </Link>
            {data.unread > 0 ? (
              <form action={markAllReadAction}>
                <button
                  type="submit"
                  className="vu-btn vu-btn-primary inline-flex h-9 items-center gap-1.5 px-3 text-[13px]"
                >
                  <CheckCheck className="size-4" aria-hidden />
                  Mark all read
                </button>
              </form>
            ) : null}
          </div>
        </header>

        <nav aria-label="Filter notifications">
          <ul className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
            {INBOX_FILTERS.map((option) => {
              const current = option === filter;
              const count = data.counts[option];
              return (
                <li key={option}>
                  <Link
                    href={
                      option === "all"
                        ? "/notifications"
                        : `/notifications?filter=${option}`
                    }
                    scroll={false}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "vu-btn inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-3 text-[12.5px] no-underline",
                      current ? "vu-btn-primary" : "vu-btn-secondary",
                    )}
                  >
                    {INBOX_FILTER_LABEL[option]}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {data.rows.length === 0 ? (
          <Blank filter={filter} empty={data.empty} />
        ) : (
          <ul className="overflow-hidden rounded-card border border-border bg-surface">
            {data.rows.map((row) => {
              const Icon = CATEGORY_ICON[row.category];
              return (
                <li key={row.id} className="border-b border-border last:border-b-0">
                  <form action={openNotificationAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className={cn(
                        "flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-default",
                        !row.read && "bg-brand-wash/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                          row.read
                            ? "bg-default text-foreground-muted"
                            : "bg-brand-fill text-brand-fill-foreground",
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "min-w-0 truncate text-[14px] text-foreground",
                              row.read ? "font-semibold" : "font-bold",
                            )}
                          >
                            {row.title}
                          </span>
                          <time
                            dateTime={row.createdAt.toISOString()}
                            className="shrink-0 text-[11.5px] tabular-nums text-foreground-muted"
                          >
                            {formatShortTime(row.createdAt)}
                          </time>
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[13px] leading-snug text-foreground-muted">
                          {row.body}
                        </span>
                        {!row.read ? (
                          <span className="sr-only">Unread</span>
                        ) : null}
                      </span>

                      {row.href ? (
                        <ChevronRight
                          className="mt-1.5 size-4 shrink-0 text-foreground-muted"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function Blank({ filter, empty }: { filter: InboxFilter; empty: boolean }) {
  // "Nothing has ever arrived" and "this tab is empty" are different problems,
  // and telling someone to check back later when they have 40 read
  // notifications one tab over is noise.
  const title = empty
    ? "Nothing yet"
    : filter === "unread"
      ? "Nothing unread"
      : `No ${INBOX_FILTER_LABEL[filter].toLowerCase()} notifications`;

  const body = empty
    ? "Replies, mentions, messages and event reminders arrive here."
    : filter === "unread"
      ? "Everything has been read. The other tabs still have your history."
      : "Other tabs may still have something — the counts above say which.";

  return (
    <div className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
        {empty ? (
          <BellOff className="size-6" aria-hidden />
        ) : (
          <CheckCheck className="size-6" aria-hidden />
        )}
      </span>
      <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[44ch] text-[14px] text-foreground-muted">
        {body}
      </p>
      {!empty && filter !== "all" ? (
        <Link
          href="/notifications"
          className="vu-btn vu-btn-secondary mt-4 inline-flex h-9 items-center px-4 text-[13.5px] no-underline"
        >
          Show everything
        </Link>
      ) : null}
    </div>
  );
}
