"use client";

import { useState } from "react";
import { Check, Lock, Search, SendHorizonal } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { startConversationAction } from "@/app/(member)/messages/actions";
import type { MessageableMember } from "@/lib/messages/start";
import { cn } from "@/lib/utils";

/**
 * Choose one person, or several for a group.
 *
 * Members who cannot be messaged are shown, disabled, with the reason — that is
 * more use than hiding them, because "they only accept messages from
 * connections" tells you what to do next, while an absence tells you nothing.
 * The reason itself comes from the same permission function the server enforces
 * on send, so it can never claim something the server would refuse.
 *
 * Filtering runs in the browser over the list the server already sent: the
 * directory is one page of rows at this size, and a round trip per keystroke
 * would be slower than the typing.
 */
export function NewMessagePicker({
  members,
  preselect,
  maxGroup,
  error,
}: {
  members: MessageableMember[];
  preselect: string | null;
  maxGroup: number;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    preselect && members.some((m) => m.handle === preselect && !m.blockedReason)
      ? [preselect]
      : [],
  );
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? members.filter(
        (member) =>
          member.name.toLowerCase().includes(needle) ||
          member.handle.toLowerCase().includes(needle) ||
          member.city?.toLowerCase().includes(needle),
      )
    : members;

  const isGroup = selected.length > 1;
  const full = selected.length + 1 >= maxGroup;

  function toggle(handle: string) {
    setSelected((current) =>
      current.includes(handle)
        ? current.filter((value) => value !== handle)
        : full
          ? current
          : [...current, handle],
    );
  }

  return (
    <form action={startConversationAction} className="flex min-h-0 flex-1 flex-col">
      {selected.map((handle) => (
        <input key={handle} type="hidden" name="handle" value={handle} />
      ))}

      <div className="shrink-0 space-y-2.5 border-b border-border px-3 py-2.5">
        {error ? (
          <p role="alert" className="text-[12.5px] font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            className="h-10 w-full rounded-ctl border border-border bg-field-background pl-9 pr-3 text-[14px] text-foreground outline-none transition placeholder:text-foreground-muted focus:border-brand focus:ring-2 focus:ring-brand/20 [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>

        {isGroup ? (
          <input
            type="text"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Group name (optional)"
            aria-label="Group name"
            maxLength={80}
            className="h-10 w-full rounded-ctl border border-border bg-field-background px-3 text-[14px] text-foreground outline-none transition placeholder:text-foreground-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        ) : null}

        {full ? (
          <p className="text-[12px] font-semibold text-foreground-muted">
            A group holds {maxGroup} people including you — that is the limit.
          </p>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-[13.5px] text-foreground-muted">
            No member matches that.
          </li>
        ) : null}

        {visible.map((member) => {
          const chosen = selected.includes(member.handle);
          const disabled = Boolean(member.blockedReason) || (full && !chosen);
          return (
            <li key={member.handle}>
              <button
                type="button"
                onClick={() => toggle(member.handle)}
                disabled={disabled}
                aria-pressed={chosen}
                className={cn(
                  "flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition",
                  chosen ? "bg-brand-wash" : "hover:bg-mint",
                  disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
                )}
              >
                <Avatar
                  name={member.name}
                  src={member.avatarUrl}
                  size="md"
                  className="size-10"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-foreground">
                    {member.name}
                  </span>
                  <span className="block truncate text-[12.5px] text-foreground-muted">
                    {member.blockedReason ? (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="size-3 shrink-0" aria-hidden />
                        {member.blockedReason}
                      </span>
                    ) : (
                      `@${member.handle}${member.city ? ` · ${member.city}` : ""}`
                    )}
                  </span>
                </span>
                {chosen ? (
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-on-brand"
                    aria-hidden
                  >
                    <Check className="size-3.5" />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-border bg-surface px-3 py-2.5">
        <button
          type="submit"
          disabled={selected.length === 0}
          className={cn(
            "inline-flex h-10 w-full items-center justify-center gap-2 rounded-ctl text-[14px] font-semibold transition",
            selected.length > 0
              ? "bg-brand-strong text-white hover:bg-deep-forest"
              : "bg-default text-foreground-muted",
          )}
        >
          <SendHorizonal className="size-4" aria-hidden />
          {selected.length === 0
            ? "Pick someone"
            : isGroup
              ? `Start group with ${selected.length} people`
              : "Start conversation"}
        </button>
      </div>
    </form>
  );
}
