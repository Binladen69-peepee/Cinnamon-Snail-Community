"use client";

import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";

/**
 * App theme follows the OS light/dark preference via next-themes.
 * `.dark` lands on <html> so every page (member + marketing) shares one switch.
 */
export function HeroUIProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="vu-theme"
      disableTransitionOnChange
    >
      <ForceSystemTheme />
      {children}
    </ThemeProvider>
  );
}

/** Clear any saved light/dark override so the OS preference always wins. */
function ForceSystemTheme() {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (theme !== "system") setTheme("system");
  }, [theme, setTheme]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider>{children}</HeroUIProvider>;
}
