/**
 * The modal dialog's housekeeping, kept free of React so each rule can be
 * tested on its own: what can take focus, where Tab goes at the edges, which
 * key dismisses, and how the page's scroll is locked and given back.
 */

/** Everything that might be in the tab order; `isTabbable` decides. */
export const FOCUSABLE_SELECTOR =
  'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable=""], [contenteditable="true"], [tabindex]';

type FocusCandidate = {
  tabIndex: number;
  disabled?: boolean;
  getClientRects(): { length: number };
  closest(selector: string): unknown;
};

/**
 * In the tab order right now: not removed from it, not disabled, not inside
 * something inert, and rendered (a collapsed panel's contents are not).
 */
export function isTabbable(node: FocusCandidate): boolean {
  return (
    node.tabIndex >= 0 &&
    node.disabled !== true &&
    !node.closest("[inert]") &&
    node.getClientRects().length > 0
  );
}

/** The tabbable elements inside `root`, in document order. */
export function tabbablesIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isTabbable);
}

/**
 * Where Tab (or Shift+Tab) should send focus to keep it inside the dialog,
 * or null to let the browser move it normally.
 *
 * - Nothing tabbable: the dialog itself keeps focus.
 * - Off either end, from the dialog itself, or from outside: wrap around.
 * - From an element inside that is not in the tab order: leave it to the
 *   browser, which moves to the next element in the document.
 */
export function trapFocusTarget<T>(
  items: readonly T[],
  active: T | null,
  container: T,
  backwards: boolean,
  activeIsInside: boolean,
): T | null {
  if (items.length === 0) return container;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const listed = active !== null && items.includes(active);
  if (!activeIsInside || active === container) return backwards ? last : first;
  if (!listed) return null;
  if (backwards) return active === first ? last : null;
  return active === last ? first : null;
}

/** Escape dismisses, unless it is ending an IME composition. */
export function isDismissKey(event: { key: string; isComposing?: boolean }): boolean {
  return event.key === "Escape" && event.isComposing !== true;
}

type ScrollLockBody = { style: { overflow: string; paddingRight: string } };

/**
 * Stops the page scrolling behind a dialog, and returns the function that
 * gives it back.
 *
 * `scrollbarWidth` (the window's width less the document's) is added to the
 * body's `paddingRight` while the scrollbar is hidden, so the page does not
 * shift sideways under the backdrop.
 *
 * On release, each value is restored only if it is still the one set here.
 * When something that locked the page first (a drawer) has already released
 * it, the dialog's release must not lock it again.
 */
export function lockBodyScroll(
  body: ScrollLockBody,
  { scrollbarWidth, paddingRight }: { scrollbarWidth: number; paddingRight: number },
): () => void {
  const { style } = body;
  const previousOverflow = style.overflow;
  const previousPadding = style.paddingRight;

  style.overflow = "hidden";
  let padding: string | null = null;
  if (scrollbarWidth > 0) {
    padding = `${paddingRight + scrollbarWidth}px`;
    style.paddingRight = padding;
  }

  return () => {
    if (style.overflow === "hidden") style.overflow = previousOverflow;
    if (padding !== null && style.paddingRight === padding) style.paddingRight = previousPadding;
  };
}
