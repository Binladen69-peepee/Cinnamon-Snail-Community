"use client";

import { ThemeProvider } from "next-themes";

/**
 * App theme: system by default; user can override via the theme control in the
 * account menu / floating toggle. `.dark` on <html> drives member + marketing.
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
      {children}
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider>{children}</HeroUIProvider>;
}
