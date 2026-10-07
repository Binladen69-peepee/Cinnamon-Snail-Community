import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Where the Theme picker is plugged in, and what it costs a page.
 *
 * - The button is in the member rail (and so in the phone drawer, which
 *   renders that rail), the console rail and the console's phone bar.
 * - The palette goes on <html> from <head>, before anything paints.
 * - The button ships alone: the dialog, motion and the Aceternity parts are
 *   only reached through a dynamic import.
 */

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

/** Static imports only: `import x from "y"` and `import { x } from "y"`, not `import type`. */
const staticImports = (source: string) =>
  [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";?$/gm)].map((m) => m[1]!);

describe("the Theme button is wired in", () => {
  it("at the foot of the member rail, after the staff console row", () => {
    const rail = read("components/app/side-rail.tsx");
    expect(rail).toContain('import { ThemeButton } from "@/components/theme/theme-button";');
    const foot = rail.slice(rail.indexOf("</nav>"));
    expect(foot).toMatch(/label="Admin console"[\s\S]*<ThemeButton \/>/);
  });

  it("in the phone drawer, which renders that same rail", () => {
    const layout = read("app/(member)/layout.tsx");
    expect(layout).toMatch(/const rail = <SideRail /);
    expect(layout).toContain("<NavDrawer>{rail}</NavDrawer>");
    expect(read("components/app/nav-drawer.tsx")).toMatch(/\{children\}/);
  });

  it("at the foot of the console rail, and so in the console's drawer", () => {
    const sidebar = read("components/admin/admin-sidebar.tsx");
    expect(sidebar).toContain('import { ThemeButton } from "@/components/theme/theme-button";');
    expect(sidebar.slice(sidebar.indexOf("</nav>"))).toContain("<ThemeButton />");
    expect(read("components/admin/admin-mobile-nav.tsx")).toMatch(/<AdminSidebar /);
  });

  it("in the console's phone bar", () => {
    const bar = read("components/admin/admin-mobile-nav.tsx");
    expect(bar).toContain('import { ThemeButton } from "@/components/theme/theme-button";');
    expect(bar).toContain('<ThemeButton variant="icon"');
  });
});

describe("the palette before the first paint", () => {
  const layout = read("app/layout.tsx");

  it("runs the boot script from the root layout's <head>", () => {
    expect(layout).toContain('import { ACCENT_BOOT_SCRIPT } from "@/lib/theme/boot-script";');
    const head = /<head>([\s\S]*?)<\/head>/.exec(layout)?.[1];
    expect(head).toBeDefined();
    expect(head).toContain("<script dangerouslySetInnerHTML={{ __html: ACCENT_BOOT_SCRIPT }} />");
    expect(layout.indexOf("<head>")).toBeLessThan(layout.indexOf("<body"));
  });

  it("keeps hydration quiet about the attribute it adds to <html>", () => {
    expect(layout).toMatch(/<html[\s\S]*?suppressHydrationWarning[\s\S]*?>/);
  });

  it("puts it back after hydration from the button, which every app page has", () => {
    const button = read("components/theme/theme-button.tsx");
    expect(button).toMatch(/useLayoutEffect\(\(\) => \{\s*syncAccentFromStorage\(\);\s*\}, \[\]\)/);
  });
});

describe("the button ships alone", () => {
  const lightweight = [
    "components/theme/theme-button.tsx",
    "components/theme/palette-strip.tsx",
    "components/theme/load-theme-dialog.ts",
    "lib/theme/accent.ts",
    "lib/theme/boot-script.ts",
    "lib/theme/palettes.ts",
  ];

  it("imports no motion and no Aceternity part, directly or through its own imports", () => {
    for (const file of lightweight) {
      for (const specifier of staticImports(read(file))) {
        expect(specifier, file).not.toMatch(
          /^motion(\/|$)|framer-motion|components\/aceternity\/|\/theme-dialog$|\/theme-panel$/,
        );
      }
    }
  });

  it("reaches the dialog only through a dynamic import, shared by every caller", () => {
    const loader = read("components/theme/load-theme-dialog.ts");
    expect(loader).toMatch(/pending \?\?= import\("@\/components\/theme\/theme-dialog"\)/);
    expect(loader).toMatch(/^import type \{ ThemeDialogProps \} from "@\/components\/theme\/theme-dialog";$/m);
    const button = read("components/theme/theme-button.tsx");
    expect(button).toMatch(/^import type \{ ThemeDialogProps \} from "@\/components\/theme\/theme-dialog";$/m);
    // Fetched early on hover and focus.
    expect(button).toMatch(/onPointerEnter: prefetch/);
    expect(button).toMatch(/onFocus: prefetch/);
  });

  it("mounts the dialog in the app's root, where the app's type and button rules reach it", () => {
    const dialog = read("components/theme/theme-dialog.tsx");
    expect(dialog).toContain('const APP_ROOT = "[data-app-shell], .vu-admin";');
    expect(dialog).toMatch(/document\.querySelector\(APP_ROOT\)/);
  });
});
