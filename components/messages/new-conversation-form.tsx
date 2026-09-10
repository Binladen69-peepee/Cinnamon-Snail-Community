"use client";

import { useActionState, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  createGroupAction,
  startDirectMessageAction,
} from "@/app/(member)/messages/actions";
import { MAX_GROUP_MEMBERS } from "@/lib/messages/permissions";
import { cn } from "@/lib/utils";

type Member = { handle: string; name: string; avatarUrl: string | null };

export function NewConversationForm({
  members,
  preselected,
}: {
  members: Member[];
  preselected: string | null;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(
    preselected && members.some((member) => member.handle === preselected)
      ? [preselected]
      : [],
  );
  const [directState, directAction, directPending] = useActionState(
    startDirectMessageAction,
    {},
  );
  const [groupState, groupAction, groupPending] = useActionState(
    createGroupAction,
    {},
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members.slice(0, 40);
    return members
      .filter(
        (member) =>
          member.name.toLowerCase().includes(needle) ||
          member.handle.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [members, query]);

  function toggle(handle: string) {
    setSelected((current) =>
      current.includes(handle)
        ? current.filter((item) => item !== handle)
        : current.length >= MAX_GROUP_MEMBERS - 1
          ? current
          : [...current, handle],
    );
  }

  const isGroup = selected.length > 1;
  const error = directState.error ?? groupState.error;
  const pending = directPending || groupPending;

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search members by name or handle"
        aria-label="Search members"
        className="w-full rounded-2xl border border-sand bg-surface px-4 py-3 text-sm outline-none focus-visible:border-accent"
      />

      {members.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">
          No members are open to messages right now.
        </p>
      ) : (
        <ul className="grid max-h-96 gap-2 overflow-y-auto pr-1">
          {filtered.map((member) => {
            const active = selected.includes(member.handle);
            return (
              <li key={member.handle}>
                <button
                  type="button"
                  onClick={() => toggle(member.handle)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-accent bg-sage/40"
                      : "border-sand hover:border-accent/60",
                  )}
                >
                  <Avatar name={member.name} src={member.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-forest">
                      {member.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      @{member.handle}
                    </span>
                  </span>
                  {active ? (
                    <span className="text-xs font-semibold text-accent">Selected</span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              No members match “{query}”.
            </li>
          ) : null}
        </ul>
      )}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {isGroup ? (
        <form action={groupAction} className="space-y-3">
          {selected.map((handle) => (
            <input key={handle} type="hidden" name="handles" value={handle} />
          ))}
          <input
            name="title"
            placeholder="Group name (optional)"
            className="w-full rounded-2xl border border-sand bg-surface px-4 py-3 text-sm outline-none focus-visible:border-accent"
          />
          <Button type="submit" disabled={pending} className="w-full">
            {pending
              ? "Creating…"
              : `Start group with ${selected.length} members`}
          </Button>
        </form>
      ) : (
        <form action={directAction}>
          <input type="hidden" name="handle" value={selected[0] ?? ""} />
          <Button
            type="submit"
            disabled={pending || selected.length === 0}
            className="w-full"
          >
            {pending
              ? "Opening…"
              : selected.length === 0
                ? "Pick someone to message"
                : `Message @${selected[0]}`}
          </Button>
        </form>
      )}
      <p className="text-xs text-muted">
        Select more than one person to start a small group (up to{" "}
        {MAX_GROUP_MEMBERS}).
      </p>
    </div>
  );
}
