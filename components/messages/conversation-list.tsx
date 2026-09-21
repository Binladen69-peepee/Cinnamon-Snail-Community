"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { PenSquare, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <h2 className="text-[15px] font-bold text-foreground">Messages</h2>
        <Link
          href="/messages/new"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold no-underline transition",
            openId === "new"
              ? "bg-brand-fill text-brand-fill-foreground"
              : "text-brand hover:bg-brand-wash",
          )}
        >
          <PenSquare className="size-3.5" aria-hidden />
          New
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13.5px] text-foreground-muted">
          No conversations yet.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((row) => {
            const current = row.id === openId;
            return (
              <li key={row.id}>
                <Link
                  href={`/messages/${row.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex gap-2.5 border-b border-border px-3 py-2.5 no-underline transition",
                    current ? "bg-brand-wash" : "hover:bg-mint",
                  )}
                >
                  {row.isGroup ? (
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-sage text-forest"
                      aria-hidden
                    >
                      <Users className="size-5" />
                    </span>
                  ) : (
                    <Avatar
                      name={row.others[0]?.name ?? row.title}
                      src={row.others[0]?.avatarUrl ?? null}
                      size="md"
                      className="size-10"
                    />
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "min-w-0 truncate text-[14px] text-foreground",
                          row.unread > 0 ? "font-bold" : "font-semibold",
                        )}
                      >
                        {row.title}
                      </span>
                      {row.lastMessageAt ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-foreground-muted">
                          {formatShortTime(new Date(row.lastMessageAt))}
                        </span>
                      ) : null}
                    </span>

                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "min-w-0 truncate text-[12.5px]",
                          row.unread > 0
                            ? "font-semibold text-foreground"
                            : "text-foreground-muted",
                        )}
                      >
                        {row.preview}
                      </span>
                      {row.unread > 0 ? (
                        <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-bold tabular-nums text-on-brand">
                          {row.unread > 99 ? "99+" : row.unread}
                        </span>
                      ) : null}
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
