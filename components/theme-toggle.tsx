"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@heroui/react";

function subscribe() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();

  if (!isClient) {
    return <span className="inline-flex size-11 shrink-0" aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      isIconOnly
      variant="ghost"
      size="md"
      className="shrink-0"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onPress={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </Button>
  );
}
