"use client";

import { ThemeProvider } from "next-themes";

/**
 * HeroUI v3 has no runtime HeroUIProvider — theming is CSS variables.
 * This wrapper is the app-level provider the ticket asked for: next-themes
 * with a class strategy so `.dark` lands on `<html>`.
 */
export function HeroUIProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider>{children}</HeroUIProvider>;
}
