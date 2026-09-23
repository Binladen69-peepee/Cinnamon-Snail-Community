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
  counts: Record<InboxFilter, number>;
  unread: number;
  /** True when this member has never received one, as opposed to this tab
   *  being empty — the two need different things said about them. */
  empty: boolean;
};

const PAGE_SIZE = 60;

export async function loadInbox(input: {
  userId: string;
  filter: InboxFilter;
}): Promise<InboxData> {
  const { userId, filter } = input;

  const [rows, total, unread, mentions, replies, events, system] =
    await Promise.all([
      prisma.notification.findMany({
        where: inboxWhere(filter, userId),
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        take: PAGE_SIZE,
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
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.notification.count({ where: { userId, category: "MENTIONS" } }),
      prisma.notification.count({ where: { userId, category: "REPLIES" } }),
      prisma.notification.count({ where: { userId, category: "EVENTS" } }),
      prisma.notification.count({ where: { userId, category: "SYSTEM" } }),
    ]);

  return {
    filter,
    rows: rows.map((row) => ({
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
