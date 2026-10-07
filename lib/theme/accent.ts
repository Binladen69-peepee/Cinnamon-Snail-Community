import { useSyncExternalStore } from "react";
import { ACCENT_ATTRIBUTE } from "@/lib/theme/boot-script";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_PALETTE,
  isPaletteId,
  type PaletteId,
} from "@/lib/theme/palettes";

/**
 * The member's palette, on this page and in this browser (DEC-082).
 *
 * What is applied lives on <html> as `data-accent` (absent for the default palette, the
 * default) and is what the app's CSS reads; what is remembered lives in
 * localStorage under `vu-accent`. The boot script (`./boot-script`) copies
 * the second onto the first before the first paint, and this keeps the two in
 * step afterwards: in this tab, across tabs, and when storage is unavailable.
 *
 * Every read and write of localStorage is guarded: it throws when storage is
 * blocked, and a palette is not worth an error page.
 */

/**
 * Fired on `window` when this tab changes the palette: a CustomEvent whose
 * `detail` is `{ accent }`, the palette now applied.
 */
export const ACCENT_CHANGE_EVENT = "vu-accent-change";

export type AccentChangeDetail = { accent: PaletteId };

/**
 * A choice this page could not save (storage blocked or full). It stays
 * applied for as long as the page is open, and wins over what storage says
 * when the rail mounts again and re-reads it.
 */
let unsaved: PaletteId | null = null;

function htmlElement(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

/** The palette applied to the page now. The default palette without an attribute. */
export function getAccent(): PaletteId {
  const value = htmlElement()?.getAttribute(ACCENT_ATTRIBUTE);
  return isPaletteId(value) ? value : DEFAULT_PALETTE;
}

/** What the server renders: it cannot see the browser's choice. */
export function getServerAccent(): PaletteId {
  return DEFAULT_PALETTE;
}

/** The saved palette, the default palette when nothing valid is saved, or null when storage cannot be read. */
export function readStoredAccent(): PaletteId | null {
  try {
    const value = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isPaletteId(value) ? value : DEFAULT_PALETTE;
  } catch {
    return null;
  }
}

function applyAccent(id: PaletteId): void {
  const element = htmlElement();
  if (!element) return;
  if (id === DEFAULT_PALETTE) element.removeAttribute(ACCENT_ATTRIBUTE);
  else element.setAttribute(ACCENT_ATTRIBUTE, id);
}

/** Saves the choice; the default is saved as nothing at all. */
function saveAccent(id: PaletteId): boolean {
  try {
    if (id === DEFAULT_PALETTE) localStorage.removeItem(ACCENT_STORAGE_KEY);
    else localStorage.setItem(ACCENT_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

function announceChange(accent: PaletteId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AccentChangeDetail>(ACCENT_CHANGE_EVENT, { detail: { accent } }),
  );
}

/**
 * Applies a palette now and remembers it in this browser. Anything that is
 * not a known palette id is refused: nothing changes and it returns false.
 */
export function setAccent(id: unknown): boolean {
  if (!isPaletteId(id)) return false;
  applyAccent(id);
  unsaved = saveAccent(id) ? null : id;
  announceChange(id);
  return true;
}

/**
 * Puts the saved palette back on the page if something took it off or it is
 * stale: React's development remount resets the attributes on <html> (see
 * "Re-applying attributes in development" in the Next.js guide on preventing
 * flash), and a palette chosen in another tab while this one was on a page
 * without the rail never reached this one. The rail calls it when it mounts.
 */
export function syncAccentFromStorage(): void {
  const saved = unsaved ?? readStoredAccent();
  if (saved === null || saved === getAccent()) return;
  applyAccent(saved);
  announceChange(saved);
}

/** Calls `onChange` when the palette changes, in this tab or in another. */
export function subscribeAccent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    // A null key means another tab cleared storage outright.
    if (event.key !== null && event.key !== ACCENT_STORAGE_KEY) return;
    const next = event.key === null ? null : event.newValue;
    unsaved = null;
    applyAccent(isPaletteId(next) ? next : DEFAULT_PALETTE);
    onChange();
  };
  window.addEventListener(ACCENT_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ACCENT_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The palette applied now, kept current. The server, and the first render in
 * the browser, see the default palette; React then re-renders with the real one, so
 * hydration never mismatches.
 */
export function useAccent(): PaletteId {
  return useSyncExternalStore(subscribeAccent, getAccent, getServerAccent);
}
