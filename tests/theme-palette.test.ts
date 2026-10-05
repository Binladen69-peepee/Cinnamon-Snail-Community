import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two palettes, each held to its own rules.
 *
 * The marketing site and the sign-in pages are monochrome, and stay that way.
 * This file has enforced that policy in both directions before — no hue
 * (`DEC-037`), one brand hue (`DEC-044`), no hue again (`DEC-045`) — and the
 * reason for guarding it has not changed: every surface paints from role
 * tokens, so one stray hue in those blocks repaints hundreds of components.
 *
 * Everything signed in — the member app and the admin console — carries the
 * teal palette (`DEC-076`, `DEC-077`): teal for action and the major areas,
 * neutrals for everything else, and amber, red and blue for status. It is
 * declared once, in the "App design system" section at the end of
 * `globals.css`, and nowhere else. So the policy is now about *where* a hue may
 * live, which is a stricter property than "none at all": a green anywhere
 * outside that section is still the regression this catches.
 */

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8").replace(/\r\n/g, "\n");

/** Where the app's palette starts. Everything before it is the marketing sheet. */
const APP_MARKER = "App design system: the member app and the admin console.";
const appStart = css.indexOf(APP_MARKER);
const marketingCss = css.slice(0, appStart);
const appCss = css.slice(appStart);

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
 * The marketing sheet's families. Gold and red are reserved: they mean warning
 * and danger, and they are never spent on decoration. Everything else is grey.
 */
const MARKETING_FAMILIES: [string, number, number][] = [
  ["gold / amber", 25, 60],
  ["red / terracotta", 0, 24],
];

/** The app's families: teal, the yellow accent, and status. */
const APP_FAMILIES: [string, number, number][] = [
  ["danger red", 0, 24],
  ["yellow / amber", 25, 60],
  ["teal", 165, 190],
  ["info blue", 200, 215],
];

const familyIn =
  (families: [string, number, number][]) =>
  (hex: string): string | null => {
    const h = hue(hex);
    if (h === null) return "grey";
    return families.find(([, lo, hi]) => h >= lo && h <= hi)?.[0] ?? null;
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
  return found![1]!.toLowerCase();
};

const APP_LIGHT = ":root:has([data-app-shell], .vu-admin) {";
const APP_DARK = ":root.dark:has([data-app-shell], .vu-admin) {";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("marketing palette", () => {
  it("keeps the app palette in its own section, after everything else", () => {
    expect(appStart).toBeGreaterThan(-1);
    // Exactly one declaration of each app scope, both inside that section.
    for (const scope of [APP_LIGHT, APP_DARK]) {
      expect(css.split(scope).length - 1, scope).toBe(1);
      expect(css.indexOf(scope)).toBeGreaterThan(appStart);
    }
  });

  it("contains no hue outside the two reserved families", () => {
    const hexes = marketingCss.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(hexes.length).toBeGreaterThan(50);
    const strays = [...new Set(hexes)]
      .filter((hex) => familyIn(MARKETING_FAMILIES)(hex) === null)
      .map((hex) => `${hex} (hue ${hue(hex)}°)`);
    expect(strays).toEqual([]);
  });

  it("has no green anywhere outside the app section", () => {
    // Named separately from the stray check because green is the one that
    // keeps coming back, and a failure here should say so rather than report
    // an anonymous hue.
    const hexes = marketingCss.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const greens = [...new Set(hexes)].filter((hex) => {
      const h = hue(hex);
      return h !== null && h >= 75 && h <= 175;
    });
    expect(greens).toEqual([]);
  });

  it("keeps the two grounds Adam chose", () => {
    // Light is the pale off-white Adam picked by hand; dark stays pure black,
    // which is what "truly black and white" means here.
    expect(tokenIn(blockAfter(":root,"), "background")).toBe("#f3f7f0");
    expect(tokenIn(blockAfter('[data-theme="dark"] {'), "background")).toBe("#000000");
  });

  it("still keeps warning and danger exactly where they were", () => {
    // These two are reserved. Bringing a brand hue back is not licence to
    // restyle the colours that carry meaning.
    expect(marketingCss).toMatch(/--danger: #b4442a;/);
    expect(marketingCss).toMatch(/--warning: #8a6a00;/);
    expect(marketingCss).toMatch(/--danger: #ef6f6f;/);
    expect(marketingCss).toMatch(/--warning: #e0b341;/);
  });

  it("no longer paints the headline speckle texture", () => {
    // Removed alongside the green, but for its own reason: a worn overlay on
    // the lettering reads as noise rather than craft, at any colour.
    expect(css).not.toContain(".vu-title-anim::before");
    expect(css).not.toMatch(/mix-blend-mode: multiply;[\s\S]{0,80}opacity: 0\.45/);
  });
});

describe("app palette", () => {
  it("is the palette the client briefed", () => {
    const light = blockAfter(APP_LIGHT);
    expect(tokenIn(light, "background")).toBe("#fafaf7");
    expect(tokenIn(light, "surface")).toBe("#ffffff");
    expect(tokenIn(light, "foreground")).toBe("#171717");
    expect(tokenIn(light, "brand-fill")).toBe("#0f746f");
    expect(tokenIn(light, "sidebar")).toBe("#0f746f");
    expect(tokenIn(light, "highlight")).toBe("#0f746f");
  });

  it("has no trace of the forest palette it replaced", () => {
    // DEC-077 retired forest, sage and terracotta from the app entirely.
    // The client then asked for no yellow either: teal and neutrals only.
    for (const retired of ["#1f5a45", "#8faf96", "#d47755", "#f7f5ef", "#0d1512", "accent-sage", "#ffd447"]) {
      expect(appCss.toLowerCase(), retired).not.toContain(retired);
    }
  });

  it("uses only the brand's families and status hues", () => {
    const hexes = appCss.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const strays = [...new Set(hexes)]
      .filter((hex) => familyIn(APP_FAMILIES)(hex) === null)
      .map((hex) => `${hex} (hue ${hue(hex)}°)`);
    expect(strays).toEqual([]);
  });

  it("designs dark mode rather than inverting light", () => {
    // Teal #0f746f is too dim as text on the dark ground, so dark mode lifts
    // brand text to a bright teal and keeps the fill legible against its ground.
    const light = blockAfter(APP_LIGHT);
    const dark = blockAfter(APP_DARK);
    expect(tokenIn(dark, "brand-strong")).not.toBe(tokenIn(light, "brand-strong"));
    expect(tokenIn(dark, "brand-fill")).not.toBe(tokenIn(light, "brand-fill"));
    expect(
      contrast(tokenIn(dark, "brand-strong"), tokenIn(dark, "surface")),
      "brand text on a dark card",
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(tokenIn(dark, "brand-fill"), tokenIn(dark, "background")),
      "a dark-mode button against its ground",
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("both palettes", () => {
  it("keeps the dark ladder above its own ground", () => {
    // A card darker than the page it sits on reads as a hole. Anchored to
    // selectors that appear once, not to `.dark,`, which matches the
    // `@custom-variant` line at the top of the file.
    const weight = (hex: string) =>
      (hex.replace("#", "").match(/../g) ?? []).reduce(
        (total, part) => total + parseInt(part, 16),
        0,
      );
    for (const marker of ['[data-theme="dark"] {', APP_DARK]) {
      const dark = blockAfter(marker);
      const ground = weight(tokenIn(dark, "background"));
      for (const step of ["surface", "surface-muted", "overlay", "default"]) {
        expect(weight(tokenIn(dark, step)), `${marker} --${step} vs the ground`).toBeGreaterThan(
          ground,
        );
      }
    }
  });

  it("carries a legible fill pair in every mode, not one shared colour", () => {
    // The fill and its ink must move together. The bug this caught once was a
    // fill token that flipped while the label stayed fixed white, at 1.4:1.
    for (const [name, marker] of [
      ["marketing light", ":root,"],
      ["marketing dark", '[data-theme="dark"] {'],
      ["app light", APP_LIGHT],
      ["app dark", APP_DARK],
    ] as const) {
      const block = blockAfter(marker);
      const ratio = contrast(
        tokenIn(block, "brand-fill"),
        tokenIn(block, "brand-fill-foreground"),
      );
      expect(ratio, `${name}: label on a primary button`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("components", () => {
  /**
   * Third-party brand marks are exempt, and only these.
   *
   * Google's sign-in branding rules require their own logo colours — a
   * recoloured Google "G" is not a permitted variant.
   */
  const BRAND_MARK_FILES = ["app/(auth)/login/social-buttons.tsx"];

  const sources = () =>
    walk(resolve(root, "components"))
      .concat(walk(resolve(root, "app")))
      .map((file) => ({
        file,
        relative: file.replace(root, "").replace(/\\/g, "/").slice(1),
      }))
      .filter(({ relative }) => !BRAND_MARK_FILES.includes(relative));

  it("has no colour hardcoded into a component", () => {
    // A component that writes #1f5a45 is a component that stays light-mode
    // forest in dark mode. Any hue counts, not only the reserved ones: the
    // token system only works if nothing opts out of it.
    const offenders: string[] = [];
    for (const { file, relative } of sources()) {
      const source = readFileSync(file, "utf8");
      for (const hex of source.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
        if (hue(hex) !== null) offenders.push(`${relative}: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no colour smuggled in as rgb() or rgba() either", () => {
    // Shadows and gradients are written as rgba, not hex. Same test, applied
    // to the channel form.
    const offenders: string[] = [];
    for (const { file, relative } of sources()) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
        const hex =
          "#" +
          [m[1], m[2], m[3]]
            .map((c) => Math.min(255, Number(c)).toString(16).padStart(2, "0"))
            .join("");
        if (hue(hex) !== null) offenders.push(`${relative}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines third-party brand colour to the sign-in marks", () => {
    expect(BRAND_MARK_FILES).toHaveLength(1);
    const marks = readFileSync(resolve(root, "app/(auth)/login/social-buttons.tsx"), "utf8");
    // And only inside SVGs — not leaking into buttons, text or backgrounds.
    for (const hex of marks.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      expect(marks).toMatch(new RegExp(`fill="${hex}"`, "i"));
    }
  });
});
