import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The theme is monochrome, and stays that way.
 *
 * Green was removed from the whole product — admin, member app and marketing.
 * Because every surface paints from role tokens, one hue reintroduced in
 * `globals.css` would repaint hundreds of components at once, and one
 * hardcoded hex in a component would quietly escape the token system that
 * makes the light and dark pair work. Both are checked here.
 *
 * Amber and red survive on purpose: they carry warning and danger. Stripping
 * those would remove meaning from the interface rather than decoration.
 */

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

/** Hue in degrees, or null for a grey. */
function hue(hex: string): number | null {
  const [r, g, b] = (hex.replace("#", "").match(/../g) ?? []).map(
    (part) => parseInt(part, 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  // Anything this close to grey is not carrying a colour.
  if (delta < 0.06) return null;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

function isGreen(hex: string): boolean {
  const h = hue(hex);
  return h !== null && h >= 75 && h <= 175;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("monochrome theme", () => {
  it("has no green anywhere in the stylesheet", () => {
    const hexes = css.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(hexes.length).toBeGreaterThan(50);
    const greens = [...new Set(hexes.filter(isGreen))];
    expect(greens).toEqual([]);
  });

  it("keeps both grounds pure", () => {
    // Light is pure white and dark is pure black — the two the design is named
    // for. A near-black dark ground is the most common way this drifts back.
    expect(css).toMatch(/:root,[\s\S]*?--background: #ffffff;/);
    expect(css).toMatch(/\.dark,[\s\S]*?--background: #000000;/);
    expect(css).toMatch(/\.dark,[\s\S]*?--foreground: #ffffff;/);
  });

  it("carries a real fill pair in both modes, not one shared colour", () => {
    // The fill and its ink must invert together. Yesterday's bug was a fill
    // token that flipped while the label stayed fixed white, at 1.4:1.
    expect(css).toMatch(/:root,[\s\S]*?--brand-fill: #0a0a0a;[\s\S]*?--brand-fill-foreground: #ffffff;/);
    expect(css).toMatch(/\.dark,[\s\S]*?--brand-fill: #ffffff;[\s\S]*?--brand-fill-foreground: #000000;/);
  });

  it("no longer paints the headline speckle texture", () => {
    expect(css).not.toContain(".vu-title-anim::before");
    expect(css).not.toMatch(/mix-blend-mode: multiply;[\s\S]{0,80}opacity: 0\.45/);
  });

  /**
   * Third-party brand marks are exempt, and only these.
   *
   * Google's sign-in branding rules require their own logo colours — a
   * recoloured Google "G" is not a permitted variant. The rule this suite
   * enforces is that *our* palette has no hue, not that another company's
   * trademark must be repainted to suit it.
   */
  const BRAND_MARK_FILES = ["app/(auth)/login/social-buttons.tsx"];

  it("has no green hardcoded into a component", () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(root, "components")).concat(
      walk(resolve(root, "app")),
    )) {
      const relative = file.replace(root, "").replace(/\\/g, "/").slice(1);
      if (BRAND_MARK_FILES.includes(relative)) continue;
      const source = readFileSync(file, "utf8");
      for (const hex of source.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
        if (isGreen(hex)) offenders.push(`${relative}: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no green smuggled in as rgb() or rgba() either", () => {
    // Shadows and gradients are written as rgba, not hex, and seven of them
    // were still carrying the old forest tint after the hex sweep. Same hue
    // test, applied to the channel form.
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
        if (isGreen(hex)) offenders.push(`${relative}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines third-party brand colour to the sign-in marks", () => {
    // The exemption is only worth having if it stays one file wide.
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

  it("still keeps warning and danger, which carry meaning", () => {
    // A monochrome theme is not a colourless one: these two are the exception
    // and should not be flattened to grey in a later pass.
    expect(css).toMatch(/--danger: #b4442a;/);
    expect(css).toMatch(/--warning: #8a6a00;/);
  });
});
