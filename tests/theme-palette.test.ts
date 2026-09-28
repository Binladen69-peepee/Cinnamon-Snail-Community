import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The palette is forest and cream, and stays that way.
 *
 * This file used to enforce the opposite — that the product had no hue at all
 * (`DEC-037`). `DEC-044` brought the forest back, so the policy inverted, but
 * the reason for guarding it did not: every surface paints from role tokens, so
 * one stray hue in `globals.css` repaints hundreds of components at once, and
 * one hardcoded hex in a component silently escapes the token system that makes
 * the light and dark pair work.
 *
 * What is guarded now is that the palette stays *disciplined*: one brand hue,
 * plus the amber and red that carry warning and danger, and nothing else. A
 * stray blue is the failure this catches.
 */

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

/** Hue in degrees, or null for a grey. */
function hue(hex: string): number | null {
  const [r, g, b] = (hex.replace("#", "").match(/../g) ?? []).map(
    (part) => parseInt(part, 16) / 255,
  );
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  const delta = max - min;
  // Anything this close to grey is not carrying a colour.
  if (delta < 0.06) return null;
  let h: number;
  if (max === r) h = ((g! - b!) / delta) % 6;
  else if (max === g) h = (b! - r!) / delta + 2;
  else h = (r! - g!) / delta + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

/**
 * The three families the product is allowed to contain.
 *
 * Forest is the identity. Gold and red are reserved: they mean warning and
 * danger, and they are never spent on decoration. Everything else is grey.
 */
const FAMILIES: [string, number, number][] = [
  ["forest", 75, 175],
  ["gold / amber", 25, 60],
  ["red / terracotta", 0, 24],
];

const familyOf = (hex: string): string | null => {
  const h = hue(hex);
  if (h === null) return "grey";
  return FAMILIES.find(([, lo, hi]) => h >= lo && h <= hi)?.[0] ?? null;
};

const contrast = (a: string, b: string): number => {
  const lum = (hex: string) => {
    const [r, g, b2] = (hex.replace("#", "").match(/../g) ?? []).map((part) => {
      const c = parseInt(part, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** One token block, located by a selector that appears exactly once. */
function blockAfter(marker: string): string {
  const at = css.indexOf(marker);
  expect(at, `selector not found: ${marker}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open, i);
    }
  }
  throw new Error(`unbalanced block: ${marker}`);
}

const tokenIn = (block: string, name: string): string => {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  expect(found, `--${name} not set in this block`).not.toBeNull();
  return found![1]!;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("theme palette", () => {
  it("contains no hue outside the three families", () => {
    const hexes = css.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(hexes.length).toBeGreaterThan(50);
    const strays = [...new Set(hexes)]
      .filter((hex) => familyOf(hex) === null)
      .map((hex) => `${hex} (hue ${hue(hex)}°)`);
    expect(strays).toEqual([]);
  });

  it("actually carries the forest, rather than having gone grey again", () => {
    // The inverse of the stray check: a palette of pure greys would pass the
    // test above trivially. The identity has to be present.
    const hexes = css.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const forest = [...new Set(hexes)].filter((hex) => familyOf(hex) === "forest");
    expect(forest.length).toBeGreaterThan(8);
  });

  it("keeps the two grounds Adam chose", () => {
    // Light is the pale green-white Adam picked by hand; dark stays pure black
    // (DEC-015). A green-black ground tints every photograph in the feed, so
    // the forest is never allowed to reach the floor.
    expect(tokenIn(blockAfter(":root,"), "background")).toBe("#f3f7f0");
    expect(tokenIn(blockAfter('[data-theme="dark"] {'), "background")).toBe("#000000");
  });

  it("keeps the dark ladder above its own ground", () => {
    // A card darker than the page it sits on reads as a hole.
    //
    // This assertion used to locate the block with `indexOf(".dark,")`, which
    // matches the `@custom-variant` line at the top of the file — so it was
    // silently measuring the *light* ladder, and passed only because those
    // values happened to clear the light ground by two points. It is anchored
    // to a selector that appears once now.
    const dark = blockAfter('[data-theme="dark"] {');
    const weight = (hex: string) =>
      (hex.replace("#", "").match(/../g) ?? []).reduce(
        (total, part) => total + parseInt(part, 16),
        0,
      );
    const ground = weight(tokenIn(dark, "background"));
    for (const step of ["surface", "surface-muted", "overlay", "default"]) {
      expect(weight(tokenIn(dark, step)), `--${step} vs the ground`).toBeGreaterThan(
        ground,
      );
    }
  });

  it("carries a legible fill pair in both modes, not one shared colour", () => {
    // The fill and its ink must invert together. The bug this caught once was
    // a fill token that flipped while the label stayed fixed white, at 1.4:1.
    // Asserting the ratio rather than the hex means it still holds the next
    // time the palette moves.
    for (const [name, marker] of [
      ["light", ":root,"],
      ["dark", '[data-theme="dark"] {'],
      ["admin dark", ".vu-admin {"],
      ["admin light", ":root:not(.dark) .vu-admin,"],
    ] as const) {
      const block = blockAfter(marker);
      const ratio = contrast(
        tokenIn(block, "brand-fill"),
        tokenIn(block, "brand-fill-foreground"),
      );
      expect(ratio, `${name}: label on a primary button`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("no longer paints the headline speckle texture", () => {
    // Removed alongside the green, but for its own reason: a worn overlay on
    // the lettering reads as noise rather than craft, at any colour. The hue
    // came back; this does not.
    expect(css).not.toContain(".vu-title-anim::before");
    expect(css).not.toMatch(/mix-blend-mode: multiply;[\s\S]{0,80}opacity: 0\.45/);
  });

  /**
   * Third-party brand marks are exempt, and only these.
   *
   * Google's sign-in branding rules require their own logo colours — a
   * recoloured Google "G" is not a permitted variant.
   */
  const BRAND_MARK_FILES = ["app/(auth)/login/social-buttons.tsx"];

  it("has no palette colour hardcoded into a component", () => {
    // A component that writes #1f6b46 is a component that stays forest-green
    // in dark mode. The token system only works if nothing opts out of it.
    const offenders: string[] = [];
    for (const file of walk(resolve(root, "components")).concat(
      walk(resolve(root, "app")),
    )) {
      const relative = file.replace(root, "").replace(/\\/g, "/").slice(1);
      if (BRAND_MARK_FILES.includes(relative)) continue;
      if (relative === "app/globals.css") continue;
      const source = readFileSync(file, "utf8");
      for (const hex of source.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
        const family = familyOf(hex);
        if (family && family !== "grey") offenders.push(`${relative}: ${hex} (${family})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no palette colour smuggled in as rgb() or rgba() either", () => {
    // Shadows and gradients are written as rgba, not hex. Same hue test,
    // applied to the channel form.
    const offenders: string[] = [];
    for (const file of walk(resolve(root, "components")).concat(
      walk(resolve(root, "app")),
    )) {
      const relative = file.replace(root, "").replace(/\\/g, "/").slice(1);
      if (BRAND_MARK_FILES.includes(relative)) continue;
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
        const hex =
          "#" +
          [m[1], m[2], m[3]]
            .map((c) => Math.min(255, Number(c)).toString(16).padStart(2, "0"))
            .join("");
        const family = familyOf(hex);
        if (family && family !== "grey") offenders.push(`${relative}: ${m[0]} (${family})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines third-party brand colour to the sign-in marks", () => {
    expect(BRAND_MARK_FILES).toHaveLength(1);
    const marks = readFileSync(
      resolve(root, "app/(auth)/login/social-buttons.tsx"),
      "utf8",
    );
    // And only inside SVGs — not leaking into buttons, text or backgrounds.
    for (const hex of marks.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      expect(marks).toMatch(new RegExp(`fill="${hex}"`, "i"));
    }
  });

  it("still keeps warning and danger exactly where they were", () => {
    // These two are reserved. Bringing a brand hue back is not licence to
    // restyle the colours that carry meaning.
    expect(css).toMatch(/--danger: #b4442a;/);
    expect(css).toMatch(/--warning: #8a6a00;/);
    expect(css).toMatch(/--danger: #ef6f6f;/);
    expect(css).toMatch(/--warning: #e0b341;/);
  });
});
