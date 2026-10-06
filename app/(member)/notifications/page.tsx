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
  parsePage,
  type InboxFilter,
} from "@/lib/notifications/inbox";
import { formatShortTime } from "@/lib/community/format-count";
import { AppShell } from "@/components/app/app-shell";
import {
  Button,
  ButtonLink,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
  cardClass,
} from "@/components/app/ui";
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
/** How an empty tab names what it holds: "No live class notifications". */
const EMPTY_TAB_NOUN: Partial<Record<string, string>> = {
  mentions: "mention",
  replies: "reply",
  events: "live class",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const filter = parseInboxFilter(params.filter);
  const page = parsePage(params.page);
  const data = await loadInbox({ userId: session.user.id, filter, page });
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (filter !== "all") query.set("filter", filter);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `/notifications?${text}` : "/notifications";
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Notifications"
          description={
            data.unread > 0 ? `${data.unread} unread` : "You are all caught up."
          }
          actions={
            <>
              <ButtonLink href="/settings#notifications">
                <Settings2 className="size-4" aria-hidden />
                Preferences
              </ButtonLink>
              {data.unread > 0 ? (
                <form action={markAllReadAction}>
                  <Button type="submit" variant="primary">
                    <CheckCheck className="size-4" aria-hidden />
                    Mark all read
                  </Button>
                </form>
              ) : null}
            </>
          }
        >
          <nav aria-label="Filter notifications">
            <ChipRow>
              {INBOX_FILTERS.map((option) => {
                const current = option === filter;
                const count = data.counts[option];
                return (
                  <ChipLink
                    key={option}
                    href={
                      option === "all"
                        ? "/notifications"
                        : `/notifications?filter=${option}`
                    }
                    active={current}
                  >
                    {INBOX_FILTER_LABEL[option]}
                    <span className="font-normal tabular-nums">{count}</span>
                  </ChipLink>
                );
              })}
            </ChipRow>
          </nav>
        </PageHeader>

        {data.rows.length === 0 ? (
          <Blank filter={filter} empty={data.empty} />
        ) : (
          <ul
            className={cardClass({
              padding: "none",
              className: "divide-y divide-separator overflow-hidden",
            })}
          >
            {data.rows.map((row) => {
              const Icon = CATEGORY_ICON[row.category];
              return (
                <li key={row.id}>
                  <form action={openNotificationAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-surface-muted sm:px-5"
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-full",
                          row.read
                            ? "bg-default text-foreground-muted"
                            : "bg-brand-wash text-on-brand-wash",
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={cn(
                              "min-w-0 truncate text-body text-foreground",
                              !row.read && "font-medium",
                            )}
                          >
                            {row.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <time
                              dateTime={row.createdAt.toISOString()}
                              className="text-caption tabular-nums text-foreground-muted"
                            >
                              {formatShortTime(row.createdAt)}
                            </time>
                            {!row.read ? (
                              <span
                                className="size-2 shrink-0 rounded-full bg-highlight"
                                aria-hidden
                              />
                            ) : null}
                          </span>
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-label text-foreground-muted">
                          {row.body}
                        </span>
                        {!row.read ? (
                          <span className="sr-only">Unread</span>
                        ) : null}
                      </span>

                      {row.href ? (
                        <ChevronRight
                          className="mt-2.5 size-4 shrink-0 text-foreground-muted"
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

        {page > 1 || data.hasMore ? (
          <nav
            aria-label="More notifications"
            className="flex items-center justify-between gap-3"
          >
            {page > 1 ? (
              <ButtonLink href={pageHref(page - 1)} size="sm">
                Newer
              </ButtonLink>
            ) : (
              <span />
            )}
            <span className="text-caption tabular-nums text-foreground-muted">Page {page}</span>
            {data.hasMore ? (
              <ButtonLink href={pageHref(page + 1)} size="sm">
                Older
              </ButtonLink>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
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
      : `No ${EMPTY_TAB_NOUN[filter] ?? INBOX_FILTER_LABEL[filter].toLowerCase()} notifications`;

  const body = empty
    ? "Replies, mentions, messages and live class reminders arrive here."
    : filter === "unread"
      ? "Everything has been read. The other tabs still have your history."
      : "Other tabs may still have something — the counts above say which.";

  return (
    <EmptyState
      icon={empty ? <BellOff /> : <CheckCheck />}
      title={title}
      description={body}
      action={
        !empty && filter !== "all" ? (
          <ButtonLink href="/notifications">Show everything</ButtonLink>
        ) : undefined
      }
    />
  );
}
