"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, BellOff, BellRing, Check, Settings, ShieldCheck } from "lucide-react";
import { setNotificationLevelAction } from "@/app/(member)/spaces/actions";
import { toast } from "@/components/ui/toast";
import { ButtonLink, CountBadge, buttonClass, menuClass, menuItemClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

type Level = "ALL" | "HIGHLIGHTS" | "NONE";

const LABEL: Record<Level, string> = {
  ALL: "Every post",
  HIGHLIGHTS: "Highlights only",
  NONE: "Nothing",
};

const HINT: Record<Level, string> = {
  ALL: "A notification for each new post.",
  HIGHLIGHTS: "Only what the team marks, plus replies and mentions.",
  NONE: "Replies and mentions still reach you.",
};

/**
 * The Kitchen Table's own controls, in its header.
 *
 * Everyone gets the notification choice for the table, which used to sit in a
 * space's header and has nowhere else to live now that spaces are retired
 * (DEC-078). Hosts and staff also get the review queue and the table's
 * settings; those links render only for them, and the pages behind them check
 * again.
 */
export function TableTools({
  spaceId,
  slug,
  joined,
  level,
  defaultLevel,
  canModerate,
  canManage,
  pendingCount,
}: {
  spaceId: string;
  slug: string;
  joined: boolean;
  level: Level | null;
  defaultLevel: Level;
  canModerate: boolean;
  canManage: boolean;
  pendingCount: number;
}) {
  // Pushed to the end of the header's row (and to the end of its own line
  // when it wraps), with the notifications menu last, so the menu can always
  // open leftwards inside the screen.
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {canModerate ? (
        <ButtonLink href={`/spaces/${slug}/review`} size="sm">
          <ShieldCheck className="size-4" aria-hidden />
          Review
          <CountBadge count={pendingCount} label={`${pendingCount} waiting`} />
        </ButtonLink>
      ) : null}

      {canManage ? (
        <ButtonLink href={`/spaces/${slug}/settings`} size="sm">
          <Settings className="size-4" aria-hidden />
          Settings
        </ButtonLink>
      ) : null}

      {joined ? (
        <NotifyMenu spaceId={spaceId} slug={slug} level={level} defaultLevel={defaultLevel} />
      ) : null}
    </div>
  );
}

function NotifyMenu({
  spaceId,
  slug,
  level,
  defaultLevel,
}: {
  spaceId: string;
  slug: string;
  level: Level | null;
  defaultLevel: Level;
}) {
  const [current, setCurrent] = useState<Level | null>(level);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  const effective = current ?? defaultLevel;
  const Icon = effective === "NONE" ? BellOff : effective === "ALL" ? BellRing : Bell;

  function choose(next: Level | null) {
    setOpen(false);
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    const data = new FormData();
    data.set("spaceId", spaceId);
    data.set("slug", slug);
    data.set("level", next ?? "");
    startTransition(async () => {
      const result = await setNotificationLevelAction(data);
      if (result.ok) {
        toast.success("Notification setting saved.");
      } else {
        // Put the control back, so it never shows a setting the server refused.
        setCurrent(previous);
        toast.danger(result.error);
      }
    });
  }

  const options: { value: Level | null; label: string; hint: string }[] = [
    {
      value: null,
      label: `Default (${LABEL[defaultLevel].toLowerCase()})`,
      hint: "Follows the table when the team changes it.",
    },
    ...(["ALL", "HIGHLIGHTS", "NONE"] as const).map((value) => ({
      value,
      label: LABEL[value],
      hint: HINT[value],
    })),
  ];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Kitchen Table notifications: ${LABEL[effective].toLowerCase()}`}
        title="Kitchen Table notifications"
        className={buttonClass({ size: "sm", className: "gap-1.5" })}
      >
        <Icon className="size-4" aria-hidden />
        <span className="max-sm:sr-only">Notifications</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Kitchen Table notifications"
          // The button is always the last thing on its line, at the right edge,
          // so the menu opens leftwards and stays on screen at 320px.
          className={cn(
            menuClass,
            "absolute right-0 top-[calc(100%+0.25rem)] z-30 w-72 max-w-[calc(100vw-2rem)]",
          )}
        >
          {options.map((option) => {
            const checked = option.value === current;
            return (
              <button
                key={option.value ?? "default"}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => choose(option.value)}
                className={cn(menuItemClass, "items-start")}
              >
                <Check
                  className={cn("mt-0.5 size-4", checked ? "opacity-100" : "opacity-0")}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block">{option.label}</span>
                  <span className="block text-caption font-normal text-foreground-muted">
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
