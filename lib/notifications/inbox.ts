import "server-only";
import type { NotificationCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * The notification inbox.
 *
 * DEC-028 settled the shape: one inbox with filters rather than a surface per
 * category, and — the part that matters — **reading is an action, never a
 * side-effect of rendering**. The previous build called `markNotificationsRead`
 * during render, so glancing at the inbox destroyed the unread state it existed
 * to show. Nothing in this file writes.
 *
 * The filters are DEC-028's six, not one per category. DMs are the exception
 * that proves it: they are the largest category here and they have their own
 * inbox at /messages, so a DMs tab would be a worse copy of a better page.
 */

export const INBOX_FILTERS = [
  "all",
  "unread",
  "mentions",
  "replies",
  "events",
  "system",
] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

export function parseInboxFilter(value: string | string[] | undefined): InboxFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return INBOX_FILTERS.includes(raw as InboxFilter) ? (raw as InboxFilter) : "all";
}

export const INBOX_FILTER_LABEL: Record<InboxFilter, string> = {
  all: "All",
  unread: "Unread",
  mentions: "Mentions",
  replies: "Replies",
  events: "Events",
  system: "System",
};

const CATEGORY_FOR: Partial<Record<InboxFilter, NotificationCategory>> = {
  mentions: "MENTIONS",
  replies: "REPLIES",
  events: "EVENTS",
  system: "SYSTEM",
};

/** Translates a tab into a `where` clause. Exported so the counts and the list
 *  can never disagree about what a tab means. */
export function inboxWhere(filter: InboxFilter, userId: string) {
  const category = CATEGORY_FOR[filter];
  return {
    userId,
    // Rows written only to carry an email or push the member muted in-app.
    inApp: true,
    ...(filter === "unread" ? { readAt: null } : {}),
    ...(category ? { category } : {}),
  };
}

export type InboxRow = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href: string | null;
  createdAt: Date;
  read: boolean;
};

export type InboxData = {
  filter: InboxFilter;
  rows: InboxRow[];
  page: number;
  hasMore: boolean;
  counts: Record<InboxFilter, number>;
  unread: number;
  /** True when this member has never received one, as opposed to this tab
   *  being empty — the two need different things said about them. */
  empty: boolean;
};

export const PAGE_SIZE = 40;
const MAX_PAGE = 50;

export function parsePage(value: string | string[] | undefined): number {
  const raw = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(raw) && raw >= 1 ? Math.min(raw, MAX_PAGE) : 1;
}

/**
 * Three queries, whatever the tab: the page of rows, the per-category totals
 * in one GROUP BY, and the unread total. It was seven — a count per tab.
 */
export async function loadInbox(input: {
  userId: string;
  filter: InboxFilter;
  page?: number;
}): Promise<InboxData> {
  const { userId, filter } = input;
  const page = input.page ?? 1;

  const [rows, byCategory, unread] = await Promise.all([
    prisma.notification.findMany({
      where: inboxWhere(filter, userId),
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      // One extra row says whether there is another page without a count.
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        category: true,
        title: true,
        body: true,
        href: true,
        createdAt: true,
        readAt: true,
      },
    }),
    prisma.notification.groupBy({
      by: ["category"],
      where: { userId, inApp: true },
      _count: { _all: true },
    }),
    prisma.notification.count({ where: { userId, inApp: true, readAt: null } }),
  ]);

  const count = (category: NotificationCategory) =>
    byCategory.find((row) => row.category === category)?._count._all ?? 0;
  const total = byCategory.reduce((sum, row) => sum + row._count._all, 0);
  const mentions = count("MENTIONS");
  const replies = count("REPLIES");
  const events = count("EVENTS");
  const system = count("SYSTEM");

  return {
    filter,
    page,
    hasMore: rows.length > PAGE_SIZE,
    rows: rows.slice(0, PAGE_SIZE).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      body: row.body,
      href: row.href,
      createdAt: row.createdAt,
      read: row.readAt !== null,
    })),
    counts: {
      all: total,
      unread,
      mentions,
      replies,
      events,
      system,
    },
    unread,
    empty: total === 0,
  };
}
