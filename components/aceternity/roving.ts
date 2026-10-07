import { useRef, type KeyboardEvent } from "react";

/**
 * Roving focus for a set of options: one tab stop for the whole group, and
 * the arrow keys to move within it (WAI-ARIA radio group and accordion).
 */

export type RovingAxis = "both" | "vertical";

/**
 * Where a key moves focus from `index` in a group of `length`, wrapping at
 * the ends, or null when the key is not a movement key.
 *
 * `vertical` is the accordion's set: Up, Down, Home and End only, so Left and
 * Right stay free for whatever the header contains.
 */
export function rovingTarget(
  key: string,
  index: number,
  length: number,
  axis: RovingAxis = "both",
): number | null {
  if (length <= 0) return null;
  const from = index < 0 ? 0 : index;
  switch (key) {
    case "ArrowDown":
      return (from + 1) % length;
    case "ArrowUp":
      return (from - 1 + length) % length;
    case "ArrowRight":
      return axis === "both" ? (from + 1) % length : null;
    case "ArrowLeft":
      return axis === "both" ? (from - 1 + length) % length : null;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

/** What `useRovingRadio` puts on each option. */
export type RovingItemProps = {
  ref: (node: HTMLElement | null) => void;
  role: "radio";
  "aria-checked": boolean;
  tabIndex: 0 | -1;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * The radio group pattern for any element type: the checked option (or the
 * first, when none is) is the group's one tab stop; arrows move focus and
 * check as they go; Space and Enter check the focused option.
 *
 * Spread `itemProps(value)` onto each option. Values must be unique.
 */
export function useRovingRadio<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
}): { itemProps: (item: T) => RovingItemProps } {
  const nodes = useRef(new Map<T, HTMLElement>());
  const stop = value !== null && values.includes(value) ? value : values[0];

  const itemProps = (item: T): RovingItemProps => ({
    ref: (node: HTMLElement | null) => {
      if (node) nodes.current.set(item, node);
      else nodes.current.delete(item);
    },
    role: "radio",
    "aria-checked": value === item,
    tabIndex: item === stop ? 0 : -1,
    onClick: () => onChange(item),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === " " || event.key === "Enter") {
        // Handled here rather than by the button's own click, so both keys
        // behave the same on every element type.
        event.preventDefault();
        onChange(item);
        return;
      }
      const next = rovingTarget(event.key, values.indexOf(item), values.length);
      if (next === null) return;
      event.preventDefault();
      const target = values[next]!;
      onChange(target);
      nodes.current.get(target)?.focus();
    },
  });

  return { itemProps };
}
