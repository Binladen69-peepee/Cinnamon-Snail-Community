"use client";

import { useState } from "react";
import { Check, Lock, Search, SendHorizonal } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, Callout, EmptyState, Field, Input } from "@/components/app/ui";
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

      <div className="flex shrink-0 flex-col gap-3 border-b border-separator px-3 py-3 sm:px-4">
        {error ? (
          <Callout tone="danger" className="px-3 py-2 text-label">
            {error}
          </Callout>
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <Input
            type="search"
            size="lg"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            className="pl-9 [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>

        {isGroup ? (
          <Field label="Group name" htmlFor="new-message-group-name" optional>
            <Input
              id="new-message-group-name"
              type="text"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Group name (optional)"
              aria-label="Group name"
              maxLength={80}
            />
          </Field>
        ) : null}

        {full ? (
          <p className="text-caption font-medium text-foreground-muted">
            A group holds {maxGroup} people including you — that is the limit.
          </p>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-separator overflow-y-auto">
        {visible.length === 0 ? (
          <li>
            <EmptyState
              size="sm"
              bordered={false}
              icon={<Search />}
              title="No member matches that."
              description="Try a name, a handle or a city."
            />
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
                  "flex w-full items-center gap-3 px-3 py-3 text-left transition sm:px-4",
                  chosen ? "bg-brand-wash" : "hover:bg-surface-muted",
                  disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
                )}
              >
                <Avatar name={member.name} src={member.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-foreground">
                    {member.name}
                  </span>
                  <span className="block truncate text-caption text-foreground-muted">
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
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-fill text-brand-fill-foreground"
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

      <div className="shrink-0 border-t border-border bg-surface px-3 py-3 sm:px-4">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={selected.length === 0}
          className="w-full"
        >
          <SendHorizonal className="size-4" aria-hidden />
          {selected.length === 0
            ? "Pick someone"
            : isGroup
              ? `Start group with ${selected.length} people`
              : "Start conversation"}
        </Button>
      </div>
    </form>
  );
}
