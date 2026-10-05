"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { MessageSquare, PenSquare, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink, CountBadge, EmptyState } from "@/components/app/ui";
import { PaneHeader } from "@/components/messages/pane-header";
import { formatShortTime } from "@/lib/community/format-count";
import { cn } from "@/lib/utils";

export type InboxRow = {
  id: string;
  title: string;
  isGroup: boolean;
  others: { handle: string; name: string; avatarUrl: string | null }[];
  preview: string;
  lastMessageAt: string | null;
  unread: number;
};

/**
 * The inbox.
 *
 * Which row is open comes from the route segment rather than a prop, so the
 * highlight is correct the moment the URL changes — including on back and
 * forward, which a prop threaded down from the layout would lag behind.
 */
export function ConversationList({ rows }: { rows: InboxRow[] }) {
  const openId = useSelectedLayoutSegment();
  // With nothing open, the inbox is the page, so its title is the page's
  // heading. With a thread or the picker open, that pane carries the h1.
  const Heading = openId === null ? "h1" : "h2";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneHeader className="justify-between">
        <Heading className="text-title font-semibold text-foreground">Messages</Heading>
        <ButtonLink
          href="/messages/new"
          size="sm"
          variant={openId === "new" ? "primary" : "secondary"}
        >
          <PenSquare className="size-3.5" aria-hidden />
          New
        </ButtonLink>
      </PaneHeader>

      {rows.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState
            size="sm"
            bordered={false}
            icon={<MessageSquare />}
            title="No conversations yet."
            description="Start one with someone you have been cooking alongside."
            action={
              <ButtonLink
                href="/messages/new"
                variant="primary"
                size="sm"
                className="lg:hidden"
              >
                <PenSquare className="size-3.5" aria-hidden />
                New message
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-separator overflow-y-auto">
          {rows.map((row) => {
            const current = row.id === openId;
            const unread = row.unread > 0;
            return (
              <li key={row.id}>
                <Link
                  href={`/messages/${row.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 no-underline transition sm:px-4",
                    current ? "bg-brand-wash" : "hover:bg-surface-muted",
                  )}
                >
                  {row.isGroup ? (
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
                      aria-hidden
                    >
                      <Users className="size-5" />
                    </span>
                  ) : (
                    <Avatar
                      name={row.others[0]?.name ?? row.title}
                      src={row.others[0]?.avatarUrl ?? null}
                      size="md"
                    />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-body font-semibold text-foreground">
                        {row.title}
                      </span>
                      {row.lastMessageAt ? (
                        <span className="shrink-0 text-caption tabular-nums text-foreground-muted">
                          {formatShortTime(new Date(row.lastMessageAt))}
                        </span>
                      ) : null}
                    </span>

                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "min-w-0 truncate text-caption",
                          unread ? "font-medium text-foreground" : "text-foreground-muted",
                        )}
                      >
                        {row.preview}
                      </span>
                      <CountBadge count={row.unread} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
