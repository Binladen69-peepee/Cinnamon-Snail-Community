"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { PillRadioGroup, type PillOption } from "@/components/aceternity/pill-radio-group";

/**
 * Light, dark, or whatever the device is set to: the same next-themes setting
 * the header's toggle and the account menu change, so all three agree.
 */

export type ColourMode = "light" | "dark" | "system";

const MODES: readonly PillOption<ColourMode>[] = [
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
  { value: "system", label: "System", icon: <Monitor aria-hidden /> },
];

export function isColourMode(value: unknown): value is ColourMode {
  return value === "light" || value === "dark" || value === "system";
}

const noSubscription = () => () => {};

/** False on the server and during hydration, true after (as in theme-toggle.tsx). */
function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

export function ModeSwitch({ labelledBy }: { labelledBy: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  // next-themes only knows the setting in the browser. Until then the group
  // renders with nothing chosen rather than with a guess, so the server's
  // markup and the browser's first render agree.
  const value: ColourMode | null = hydrated ? (isColourMode(theme) ? theme : "system") : null;
  const device = resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : null;

  return (
    <div className="flex flex-col gap-2">
      <PillRadioGroup
        options={MODES}
        value={value}
        onChange={setTheme}
        labelledBy={labelledBy}
        tone="brand"
        className="w-full sm:max-w-sm"
      />
      <p className="text-caption text-foreground-muted">
        {value === "system" && device
          ? `Following your device, which is ${device} right now.`
          : "Light is a soft white, never pure white; dark is black."}
      </p>
    </div>
  );
}
