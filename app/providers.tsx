"use client";

import { ThemeProvider } from "next-themes";
import { Toast } from "@heroui/react/toast";

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
  return (
    <HeroUIProvider>
      {children}
      {/* Mounted once for the whole app. Bottom-right keeps toasts clear of the
          phone tab bar, which owns the bottom-centre of every member page. */}
      <Toast.Provider placement="bottom end" maxVisibleToasts={3} />
    </HeroUIProvider>
  );
}
