import { ACCENT_STORAGE_KEY, DEFAULT_PALETTE, PALETTE_IDS } from "@/lib/theme/palettes";

/**
 * The attribute on <html> that carries the member's palette (DEC-082).
 *
 * Absent means Mulberry, the default. The tokens it selects only exist inside
 * the app (`:has([data-app-shell], .vu-admin)` in app/globals.css), so it is
 * harmless on the marketing site and the sign-in pages.
 */
export const ACCENT_ATTRIBUTE = "data-accent";

/** The palettes that need the attribute: every one but the default. */
const ATTRIBUTED_PALETTES = PALETTE_IDS.filter((id) => id !== DEFAULT_PALETTE);

/** JSON for a <script> body: `<` escaped so no value can close the tag. */
const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * Puts the saved palette on <html> while the page is still being parsed, so
 * the first paint is already in the member's colours and nothing flashes the
 * default on reload. app/layout.tsx runs it from <head>; it is the inline
 * script the "preventing flash before hydration" guide describes.
 *
 * Self-contained on purpose (it runs before any bundle), validated against
 * the known palettes so a stale or tampered value is ignored, and wrapped in
 * try/catch because reading localStorage throws when storage is blocked.
 * `lib/theme/accent.ts` keeps the attribute in step after hydration.
 */
export const ACCENT_BOOT_SCRIPT =
  "(function(){try{" +
  `var a=localStorage.getItem(${literal(ACCENT_STORAGE_KEY)});` +
  `if(${literal(ATTRIBUTED_PALETTES)}.indexOf(a)>-1)` +
  `document.documentElement.setAttribute(${literal(ACCENT_ATTRIBUTE)},a)` +
  "}catch(e){}})()";
