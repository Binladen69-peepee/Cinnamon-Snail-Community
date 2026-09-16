"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * Light/dark toggle for surfaces outside the top navbar (account menu, FAB).
 */
export function ThemeToggle({
  className,
  variant = "icon",
}: {
  className?: string;
  variant?: "icon" | "menu" | "fab";
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();

  if (!isClient) {
    return (
      <span
        className={cn(
          variant === "fab" ? "size-11" : variant === "menu" ? "h-10 w-full" : "size-9",
          "inline-flex shrink-0",
          className,
        )}
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  if (variant === "menu") {
    return (
      <button
        type="button"
        role="menuitem"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px] font-semibold text-foreground transition hover:bg-mint",
          className,
        )}
      >
        {isDark ? (
          <Sun className="size-4 text-foreground-muted" aria-hidden />
        ) : (
          <Moon className="size-4 text-foreground-muted" aria-hidden />
        )}
        {isDark ? "Light mode" : "Dark mode"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={cn(
        "grid place-items-center text-foreground-muted transition",
        variant === "fab"
          ? "size-11 rounded-card border border-border bg-surface shadow-e2 hover:border-brand hover:text-brand"
          : "size-9 rounded-full hover:bg-mint hover:text-foreground",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
