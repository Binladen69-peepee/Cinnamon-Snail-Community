"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff, BellRing, Settings, ShieldCheck } from "lucide-react";
import { setNotificationLevelAction } from "@/app/(member)/spaces/actions";
import { toast } from "@/components/ui/toast";
import { ButtonLink, CountBadge, Select } from "@/components/app/ui";

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
 *
 * A plain row rather than a card: it renders inside the space header, above
 * the tabs, so it is part of the room's masthead and not one more box above
 * the first post.
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
    <div className="flex flex-wrap items-center gap-2">
      {joined ? (
        <label className="flex min-w-0 items-center gap-2 text-label text-foreground-muted">
          <span className="shrink-0 font-medium text-foreground">Notify me</span>
          <Select
            size="sm"
            value={current}
            disabled={pending}
            onChange={(event) => choose(event.target.value as Level)}
            aria-label="Notifications for this space"
            className="w-auto"
          >
            {LEVELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      {canModerate || canManage ? (
        <div className="ml-auto flex items-center gap-2">
          {canModerate ? (
            <ButtonLink href={`/spaces/${slug}/review`} size="sm">
              <ShieldCheck className="size-4" aria-hidden />
              Review
              <CountBadge count={pendingCount} />
            </ButtonLink>
          ) : null}

          {canManage ? (
            <ButtonLink href={`/spaces/${slug}/settings`} size="sm">
              <Settings className="size-4" aria-hidden />
              Settings
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
