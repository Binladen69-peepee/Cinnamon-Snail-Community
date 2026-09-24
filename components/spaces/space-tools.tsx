"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellOff, BellRing, Settings, ShieldCheck } from "lucide-react";
import { setNotificationLevelAction } from "@/app/(member)/spaces/actions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Level = "ALL" | "HIGHLIGHTS" | "NONE" | "";

const LEVELS: { value: Level; label: string; icon: typeof Bell }[] = [
  { value: "", label: "Follow the space", icon: Bell },
  { value: "ALL", label: "Every post", icon: BellRing },
  { value: "HIGHLIGHTS", label: "Highlights only", icon: Bell },
  { value: "NONE", label: "Nothing", icon: BellOff },
];

/**
 * The row of controls a space offers the person looking at it.
 *
 * Notifications are a member's own choice and sit next to the room they apply
 * to, rather than in a settings page three clicks away. "Follow the space" is
 * offered as a real option because it is the default and it means something
 * different from "every post": it moves when the host changes the space.
 *
 * The host links only render for a host. The pages behind them check again.
 */
export function SpaceTools({
  spaceId,
  slug,
  joined,
  level,
  canManage,
  canModerate,
  pendingCount,
}: {
  spaceId: string;
  slug: string;
  joined: boolean;
  level: "ALL" | "HIGHLIGHTS" | "NONE" | null;
  canManage: boolean;
  canModerate: boolean;
  pendingCount: number;
}) {
  const [current, setCurrent] = useState<Level>(level ?? "");
  const [pending, startTransition] = useTransition();

  function choose(next: Level) {
    const previous = current;
    setCurrent(next);
    const data = new FormData();
    data.set("spaceId", spaceId);
    data.set("slug", slug);
    data.set("level", next);
    startTransition(async () => {
      const result = await setNotificationLevelAction(data);
      if (result.ok) {
        toast.success("Notification setting saved.");
      } else {
        // Put the control back where it was, so it never shows a setting the
        // server did not accept.
        setCurrent(previous);
        toast.danger(result.error);
      }
    });
  }

  if (!joined && !canManage && !canModerate) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2">
      {joined ? (
        <label className="flex items-center gap-2 text-[12.5px] text-foreground-muted">
          <span className="font-semibold text-foreground">Notify me</span>
          <select
            value={current}
            disabled={pending}
            onChange={(event) => choose(event.target.value as Level)}
            aria-label="Notifications for this space"
            className="h-11 rounded-ctl border border-field-border bg-field-background px-2 text-[12.5px] text-foreground outline-none focus:border-brand"
          >
            {LEVELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {canModerate ? (
          <Link
            href={`/spaces/${slug}/review`}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-ctl border border-border px-3 text-[12.5px] font-semibold no-underline transition",
              pendingCount > 0
                ? "border-foreground text-foreground"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Review
            {pendingCount > 0 ? (
              <span className="rounded-full bg-brand-fill px-1.5 text-[11px] font-bold text-brand-fill-foreground tabular-nums">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        ) : null}

        {canManage ? (
          <Link
            href={`/spaces/${slug}/settings`}
            className="inline-flex h-11 items-center gap-1.5 rounded-ctl border border-border px-3 text-[12.5px] font-semibold text-foreground-muted no-underline transition hover:text-foreground"
          >
            <Settings className="size-3.5" aria-hidden />
            Settings
          </Link>
        ) : null}
      </div>
    </div>
  );
}
