import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonClass, fieldClass, menuClass, menuItemClass } from "@/components/app/ui";
import {
  FIELD_SELECTOR,
  FieldGlow,
  GLOW_EVENTS,
  GLOW_RADIUS,
  attachFieldGlow,
  type GlowEnvironment,
} from "@/components/app/field-glow";

/**
 * The app's buttons, fields, dropdown menus and disclosures, after Aceternity
 * UI (the "App controls" section of app/globals.css).
 *
 * Their look is built from the role tokens, so a palette or a mode can repaint
 * them without a component knowing. These hold the parts of that which a
 * screenshot would not catch: no literal hue sneaks in, the primary's label
 * stays legible at every point of its gradient in every palette, the field's
 * resting edge is still the edge WCAG asked for, every movement has a
 * reduced-motion answer, and the pointer logic behind the field glow.
 *
 * The contrast is recomputed from the stylesheet itself: the tokens of each
 * palette and mode, and the `color-mix()` expressions of the rules, evaluated
 * in oklab as the browser does. Change a percentage and these follow it.
 */

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8").replace(/\r\n/g, "\n");

const APP_MARKER = "App design system: the member app and the admin console.";
const START = "App controls: Aceternity's buttons, fields, menus and disclosures.";
const END = "/* aceternity:end */";
const appStart = css.indexOf(APP_MARKER);
/** From the opening of the section's heading comment, so it starts outside a comment. */
const regionStart = css.lastIndexOf("/*", css.indexOf(START));
const regionEnd = css.indexOf(END);
const region = css.slice(regionStart, regionEnd);

/* ------------------------------------------------------------------------ */
/* Reading the stylesheet                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The body of the one block whose prelude is exactly `prelude`, starting a
 * line at `indent` (two spaces for a rule inside an at-rule). Anchored, so
 * `.vu-field` is not found inside `:is(…) .vu-field` or a media block.
 */
function blockOf(source: string, prelude: string, indent = ""): string {
  const text = `\n${source}`;
  const needle = `\n${indent}${prelude} {`;
  const at = text.indexOf(needle);
  expect(at, `missing: ${prelude}`).toBeGreaterThan(-1);
  expect(text.indexOf(needle, at + 1), `not unique: ${prelude}`).toBe(-1);
  const open = at + needle.length - 1;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced: ${prelude}`);
}

/** A top-level rule in the controls section. */
const rule = (prelude: string) => blockOf(region, prelude);

/** Every call of `fn(` in `text`, with its brackets balanced. */
function calls(text: string, fn: string): string[] {
  const found: string[] = [];
  let at = text.indexOf(`${fn}(`);
  while (at !== -1) {
    let depth = 0;
    for (let i = at + fn.length; i < text.length; i += 1) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          found.push(text.slice(at, i + 1));
          break;
        }
      }
    }
    at = text.indexOf(`${fn}(`, at + 1);
  }
  return found;
}

/** Splits at commas (or `separator`) that are not inside brackets or quotes. */
function splitTop(text: string, separator = ","): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim());
}

/** A block's declarations, custom properties keyed without their dashes. */
function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const statement of splitTop(body.replace(/\/\*[\s\S]*?\*\//g, ""), ";")) {
    const colon = statement.indexOf(":");
    if (colon === -1) continue;
    const name = statement.slice(0, colon).trim();
    out[name] = statement.slice(colon + 1).trim().replace(/\s+/g, " ");
  }
  return out;
}

const decls = (prelude: string) => declarations(rule(prelude));

/** Every `@media (prefers-reduced-motion: reduce)` block in the section. */
const reducedMotion = (() => {
  const bodies: string[] = [];
  let at = region.indexOf("@media (prefers-reduced-motion: reduce)");
  while (at !== -1) {
    const open = region.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < region.length; i += 1) {
      if (region[i] === "{") depth += 1;
      else if (region[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(region.slice(open + 1, i));
          break;
        }
      }
    }
    at = region.indexOf("@media (prefers-reduced-motion: reduce)", at + 1);
  }
  return bodies.join("\n");
})();

/* ------------------------------------------------------------------------ */
/* The palettes, as the cascade composes them                               */
/* ------------------------------------------------------------------------ */

type Tokens = Record<string, string>;

function tokens(prelude: string): Tokens {
  const out: Tokens = {};
  for (const [, name, hex] of blockOf(css, prelude).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[`--${name!}`] = hex!.toLowerCase();
  }
  return out;
}

const SCOPE = ":has([data-app-shell], .vu-admin)";
const BAND = ":is(.vu-app-sidebar, .vu-admin-rail, .vu-band)";

type Scope = { name: string; tokens: Tokens; band: boolean };

const SCOPES: Scope[] = (() => {
  const light = tokens(`:root${SCOPE}`);
  const dark = { ...light, ...tokens(`:root.dark${SCOPE}`) };
  const bandLight = tokens(`:root${SCOPE} ${BAND}`);
  const bandDark = tokens(`:root.dark${SCOPE} ${BAND}`);
  const scopes: Scope[] = [
    { name: "mulberry light", tokens: light, band: false },
    { name: "mulberry dark", tokens: dark, band: false },
    { name: "mulberry band light", tokens: { ...light, ...bandLight }, band: true },
    { name: "mulberry band dark", tokens: { ...dark, ...bandLight, ...bandDark }, band: true },
  ];
  const ids = [...new Set([...css.matchAll(/:root\[data-accent="([a-z0-9-]+)"\]/g)].map((m) => m[1]!))];
  for (const id of ids) {
    const accent = `[data-accent="${id}"]${SCOPE}`;
    const pLight = { ...light, ...tokens(`:root${accent}`) };
    const pDark = { ...dark, ...tokens(`:root${accent}`), ...tokens(`:root.dark${accent}`) };
    const pBandLight = tokens(`:root${accent} ${BAND}`);
    const pBandDark = tokens(`:root.dark${accent} ${BAND}`);
    scopes.push(
      { name: `${id} light`, tokens: pLight, band: false },
      { name: `${id} dark`, tokens: pDark, band: false },
      { name: `${id} band light`, tokens: { ...pLight, ...bandLight, ...pBandLight }, band: true },
      {
        name: `${id} band dark`,
        tokens: { ...pDark, ...bandLight, ...bandDark, ...pBandLight, ...pBandDark },
        band: true,
      },
    );
  }
  return scopes;
})();

/* ------------------------------------------------------------------------ */
/* Colour: sRGB, oklab, color-mix() and WCAG contrast                       */
/* ------------------------------------------------------------------------ */

/** Gamma-encoded sRGB channels in 0..1, and alpha. */
type Rgba = [number, number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function toOklab([r, g, b]: Rgba): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number], alpha: number): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(toGamma(c)));
  return [rgb[0]!, rgb[1]!, rgb[2]!, alpha];
}

/** `color-mix(in oklab, a p, b)`: premultiplied, as CSS Color 5 specifies. */
function mixOklab(a: Rgba, b: Rgba, p: number): Rgba {
  const alpha = a[3] * p + b[3] * (1 - p);
  if (alpha === 0) return [0, 0, 0, 0];
  const A = toOklab(a);
  const B = toOklab(b);
  const channel = (i: number) => (A[i]! * a[3] * p + B[i]! * b[3] * (1 - p)) / alpha;
  return fromOklab([channel(0), channel(1), channel(2)], alpha);
}

/** A translucent colour laid over an opaque one, as the browser composites. */
const over = (top: Rgba, under: Rgba): Rgba => [
  top[0] * top[3] + under[0] * (1 - top[3]),
  top[1] * top[3] + under[1] * (1 - top[3]),
  top[2] * top[3] + under[2] * (1 - top[3]),
  1,
];

const NAMED: Record<string, Rgba> = {
  white: [1, 1, 1, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

/** Evaluates a colour expression against custom properties (keyed without dashes). */
function evaluate(expression: string, vars: Record<string, string>, depth = 0): Rgba {
  expect(depth, `runaway var() chain at ${expression}`).toBeLessThan(24);
  const text = expression.trim();
  if (text.startsWith("var(") && text.endsWith(")")) {
    const [name, ...fallback] = splitTop(text.slice(4, -1));
    const value = vars[name!.trim()];
    if (value !== undefined) return evaluate(value, vars, depth + 1);
    expect(fallback.length, `${name} is not set and has no fallback`).toBeGreaterThan(0);
    return evaluate(fallback.join(","), vars, depth + 1);
  }
  if (text.startsWith("color-mix(") && text.endsWith(")")) {
    const [space, first, second] = splitTop(text.slice("color-mix(".length, -1));
    expect(space, text).toBe("in oklab");
    const weight = (part: string) => {
      const match = /^(.*\S)\s+(\d+(?:\.\d+)?)%$/.exec(part);
      return match ? { color: match[1]!, share: Number(match[2]) / 100 } : { color: part, share: null };
    };
    const a = weight(first!);
    const b = weight(second!);
    const p = a.share ?? (b.share === null ? 0.5 : 1 - b.share);
    return mixOklab(evaluate(a.color, vars, depth + 1), evaluate(b.color, vars, depth + 1), p);
  }
  if (text in NAMED) return NAMED[text]!;
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const v = hex[1]!;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).concat(1) as Rgba;
  }
  throw new Error(`cannot evaluate ${text}`);
}

const luminance = ([r, g, b]: Rgba) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** Points along a two-stop gradient, interpolated in oklab. */
const along = (top: Rgba, bottom: Rgba) => [0, 0.25, 0.5, 0.75, 1].map((t) => mixOklab(bottom, top, t));

/* ------------------------------------------------------------------------ */
/* The rules under test                                                     */
/* ------------------------------------------------------------------------ */

const IN_APP = ":is([data-app-shell], .vu-admin)";
const FILLED = `${IN_APP} :is(.vu-btn-primary, .vu-btn-danger)`;
const ENABLED = ':not(:disabled, [aria-disabled="true"])';

const BUTTON = {
  base: decls(`${IN_APP} .vu-btn`),
  small: decls(`${IN_APP} .vu-btn-sm`),
  primary: decls(`${IN_APP} .vu-btn-primary`),
  danger: decls(`${IN_APP} .vu-btn-danger`),
  filled: decls(FILLED),
  hover: decls(`${FILLED}:hover${ENABLED}`),
  active: decls(`${FILLED}:active${ENABLED}`),
  band: decls(`${IN_APP} ${BAND} .vu-btn-primary`),
  focus: decls(`${FILLED}:focus-visible`),
  disabled: decls(`${IN_APP} .vu-btn:disabled,\n${IN_APP} .vu-btn[aria-disabled="true"]`),
  secondaryHover: decls(`${IN_APP} .vu-btn-secondary:hover${ENABLED}`),
};

const FIELD = {
  base: decls(".vu-field"),
  select: decls(".vu-field.vu-select"),
  band: decls(`${BAND} .vu-field`),
  invalid: decls('.vu-field[aria-invalid="true"]'),
  disabled: decls('.vu-field:is(:disabled, [aria-disabled="true"])'),
  focus: decls(".vu-field:focus,\n.vu-field:focus-visible"),
};

const MENU = {
  base: decls(".vu-menu"),
  reaction: decls(".vu-menu.reaction-pop"),
};

const STATES = ["rest", "hover", "active"] as const;

/** The custom properties a filled button resolves, in one scope and state. */
function buttonVars(scope: Scope, variant: "primary" | "danger", state: (typeof STATES)[number]) {
  return {
    ...scope.tokens,
    ...BUTTON.base,
    ...BUTTON[variant],
    ...BUTTON.filled,
    ...(scope.band && variant === "primary" ? BUTTON.band : {}),
    ...(state === "rest" ? {} : BUTTON[state]),
  };
}

/* ------------------------------------------------------------------------ */
/* Tests                                                                    */
/* ------------------------------------------------------------------------ */

describe("the controls section", () => {
  it("sits inside the app section, so the marketing site never sees it", () => {
    expect(appStart).toBeGreaterThan(-1);
    expect(regionStart).toBeGreaterThan(appStart);
    expect(regionEnd).toBeGreaterThan(regionStart);
    // Every top-level selector in it is scoped to the app, or names a class
    // only the app's primitives (components/app/ui.tsx) put on an element.
    const bare = region.replace(/\/\*[\s\S]*?\*\//g, "");
    const preludes = bare.match(/^[^\s@}][^{};]*(?=\{)/gm) ?? [];
    expect(preludes.length).toBeGreaterThan(30);
    for (const prelude of preludes) {
      expect(prelude, prelude).toMatch(
        /\[data-app-shell\]|\.vu-admin|\.vu-field|\.vu-select|\.vu-menu|vu-app-sidebar|\.vu-band/,
      );
    }
  });

  it("paints from role tokens only: no hex, rgb() or hsl() literal anywhere in it", () => {
    // The select's chevron is a data URI whose stroke is written %23… (a
    // mid grey); a literal # would be a colour that no palette can repaint.
    expect(region.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(region.match(/\b(?:rgba?|hsla?|oklch|lab|lch|hwb)\(/g) ?? []).toEqual([]);
  });

  it("mixes only tokens with white, black or transparent", () => {
    const mixes = calls(region, "color-mix");
    expect(mixes.length).toBeGreaterThan(10);
    for (const mix of mixes) {
      const [space, ...parts] = splitTop(mix.slice("color-mix(".length, -1));
      expect(space, mix).toBe("in oklab");
      for (const part of parts) {
        const color = part.replace(/\s+\d+(?:\.\d+)?%$/, "");
        expect(color, mix).toMatch(/^(var\(--[a-z0-9-]+\)|white|black|transparent)$/);
      }
    }
  });
});

describe("buttons: Aceternity's Get Started primary", () => {
  it("is a lighter-topped gradient with a dark edge, a halo, a drop shadow and a bold label", () => {
    expect(BUTTON.primary["--vu-btn-face"]).toBe("var(--brand-fill)");
    expect(BUTTON.primary["--vu-btn-ink"]).toBe("var(--brand-fill-foreground)");
    expect(BUTTON.danger["--vu-btn-face"]).toBe("var(--danger)");
    expect(BUTTON.danger["--vu-btn-ink"]).toBe("var(--danger-foreground)");

    const filled = BUTTON.filled;
    expect(filled["--vu-btn-sheen"]).toMatch(/^color-mix\(in oklab, var\(--vu-btn-face\) \d+%, white\)$/);
    expect(filled["--vu-btn-edge"]).toMatch(/^color-mix\(in oklab, var\(--vu-btn-face\) \d+%, black\)$/);
    expect(filled["--vu-btn-halo"]).toMatch(/^color-mix\(in oklab, var\(--vu-btn-face\) \d+%, transparent\)$/);
    expect(filled["background-image"]).toBe(
      "linear-gradient(to bottom, var(--vu-btn-top), var(--vu-btn-bottom))",
    );
    expect(filled.color).toBe("var(--vu-btn-ink)");
    expect(filled["font-weight"]).toBe("700");

    const shadows = splitTop(filled["box-shadow"]!);
    expect(shadows[0]).toBe("inset 0 0 0 1px var(--vu-btn-edge)");
    expect(shadows[1]).toBe("0 0 0 var(--vu-btn-ring) var(--vu-btn-halo)");
    expect(shadows.slice(2).every((shadow) => /^0 \d+px \d+px/.test(shadow))).toBe(true);
  });

  it("registers the painted stops, so a state change eases between gradients", () => {
    for (const name of ["--vu-btn-top", "--vu-btn-bottom"]) {
      const body = declarations(blockOf(css, `@property ${name}`));
      expect(body.syntax).toBe('"<color>"');
      expect(body.inherits).toBe("false");
    }
    expect(BUTTON.base.transition).toContain("--vu-btn-top");
    expect(BUTTON.base.transition).toContain("--vu-btn-bottom");
  });

  it("keeps the label at 4.5:1 or better at every point of the gradient, in every palette, mode and state", () => {
    // Fourteen palettes-and-modes, primary and danger, at rest, hovered and
    // pressed. For a white label the lightest point is the top; for a dark
    // label on a light fill (most palettes in dark mode, and every band) it is
    // the bottom. Sampling the whole gradient covers both.
    expect(SCOPES.length).toBeGreaterThanOrEqual(20);
    const failures: string[] = [];
    let weakest = Infinity;
    for (const scope of SCOPES) {
      for (const variant of ["primary", "danger"] as const) {
        for (const state of STATES) {
          const vars = buttonVars(scope, variant, state);
          const ink = evaluate("var(--vu-btn-ink)", vars);
          const points = along(evaluate("var(--vu-btn-top)", vars), evaluate("var(--vu-btn-bottom)", vars));
          const lightest = points.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
          const darkest = points.reduce((a, b) => (luminance(b) < luminance(a) ? b : a));
          const ratio = Math.min(contrast(ink, lightest), contrast(ink, darkest));
          weakest = Math.min(weakest, ratio);
          if (ratio < 4.5) failures.push(`${scope.name} ${variant} ${state}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(weakest).toBeGreaterThanOrEqual(4.5);
  });

  it("is lighter at the top than at the bottom, as the reference is, in every palette and mode", () => {
    for (const scope of SCOPES.filter((s) => !s.band)) {
      const vars = buttonVars(scope, "primary", "rest");
      const top = evaluate("var(--vu-btn-top)", vars);
      const bottom = evaluate("var(--vu-btn-bottom)", vars);
      expect(toOklab(top)[0], scope.name).toBeGreaterThan(toOklab(bottom)[0]);
    }
    // In a band the face is white, so the gradient runs down to the band's tint.
    for (const scope of SCOPES.filter((s) => s.band)) {
      const vars = buttonVars(scope, "primary", "rest");
      expect(evaluate("var(--vu-btn-top)", vars), scope.name).toEqual(evaluate("var(--brand-fill)", vars));
      expect(toOklab(evaluate("var(--vu-btn-top)", vars))[0]).toBeGreaterThan(
        toOklab(evaluate("var(--vu-btn-bottom)", vars))[0],
      );
    }
  });

  it("brightens on hover without ever passing its resting top", () => {
    for (const scope of SCOPES) {
      const rest = buttonVars(scope, "primary", "rest");
      const hover = buttonVars(scope, "primary", "hover");
      const L = (vars: Record<string, string>, name: string) => toOklab(evaluate(`var(--${name})`, vars))[0];
      expect(L(hover, "vu-btn-bottom"), scope.name).toBeGreaterThan(L(rest, "vu-btn-bottom"));
      expect(L(hover, "vu-btn-bottom"), scope.name).toBeLessThanOrEqual(L(rest, "vu-btn-top") + 1e-9);
      expect(L(hover, "vu-btn-top"), scope.name).toBeCloseTo(L(rest, "vu-btn-top"), 9);
    }
  });

  it("widens the halo on hover, sinks a pixel on press, and drops the halo when disabled", () => {
    expect(splitTop(BUTTON.hover["box-shadow"]!)[1]).toBe(
      "0 0 0 calc(var(--vu-btn-ring) + 1px) var(--vu-btn-halo)",
    );
    expect(BUTTON.active.transform).toBe("translateY(var(--vu-btn-lift))");
    expect(BUTTON.disabled["box-shadow"]).toBe("inset 0 0 0 1px var(--border)");
    expect(BUTTON.disabled.opacity).toBe("0.5");
  });

  it("puts the focus outline outside the halo, hovered or not", () => {
    const offset = /^calc\(var\(--vu-btn-ring\) \+ (\d+)px\)$/.exec(BUTTON.focus["outline-offset"] ?? "");
    expect(offset, BUTTON.focus["outline-offset"]).not.toBeNull();
    // The hovered halo is one pixel wider than the resting one; the outline
    // clears it as well.
    const growth = Number(/calc\(var\(--vu-btn-ring\) \+ (\d+)px\)/.exec(BUTTON.hover["box-shadow"]!)?.[1]);
    expect(Number(offset![1])).toBeGreaterThan(growth);
  });

  it("draws a thinner halo on small buttons, which buttonClass marks", () => {
    const ring = (value: string | undefined) => Number(/^(\d+)px$/.exec(value ?? "")?.[1]);
    expect(ring(BUTTON.small["--vu-btn-ring"])).toBeLessThan(ring(BUTTON.base["--vu-btn-ring"]));
    expect(ring(BUTTON.small["--vu-btn-ring"])).toBeGreaterThan(0);
    expect(buttonClass({ size: "sm" }).split(" ")).toContain("vu-btn-sm");
    expect(buttonClass().split(" ")).toContain("vu-btn-md");
    expect(buttonClass({ size: "lg", iconOnly: true }).split(" ")).toContain("vu-btn-lg");
    // The API is unchanged: same variant classes, same sizes.
    expect(buttonClass({ variant: "primary" }).split(" ")).toEqual(
      expect.arrayContaining(["vu-btn", "vu-btn-primary", "h-9"]),
    );
  });

  it("lifts the secondary a pixel on hover, as Aceternity's Simple button does", () => {
    expect(BUTTON.secondaryHover.transform).toBe("translateY(calc(var(--vu-btn-lift) * -1))");
    expect(BUTTON.secondaryHover["box-shadow"]).toContain("var(--e2)");
  });

  it("moves nothing under reduced motion", () => {
    // Every lift and press goes through --vu-btn-lift, which reduced motion zeroes.
    const buttonRules = region.slice(0, region.indexOf("App fields: Aceternity's input"));
    for (const move of buttonRules.match(/translateY\([^;]*\)/g) ?? []) {
      expect(move).toContain("var(--vu-btn-lift)");
    }
    expect(declarations(blockOf(reducedMotion, `${IN_APP} .vu-btn`, "  "))["--vu-btn-lift"]).toBe("0px");
  });
});

describe("fields: Aceternity's input", () => {
  it("registers the glow's radius, so it grows in and fades out", () => {
    const glowR = declarations(blockOf(css, "@property --glow-r"));
    expect(glowR.syntax).toBe('"<length>"');
    expect(glowR.inherits).toBe("false");
    expect(glowR["initial-value"]).toBe("0px");
    expect(FIELD.base.transition).toMatch(/^--glow-r \d+ms/);
    // The edge is painted, not a border, so it is registered to ease on hover
    // the way the border-color did.
    const edge = declarations(blockOf(css, "@property --vu-field-edge"));
    expect(edge.syntax).toBe('"<color>"');
    expect(edge.inherits).toBe("false");
    expect(FIELD.base.transition).toMatch(/--vu-field-edge \d+ms/);
  });

  it("draws the glow at the pointer, two pixels deep, over an edge it never replaces", () => {
    expect(FIELD.base["border-color"]).toBe("transparent");
    expect(FIELD.base["--vu-field-edge"]).toBe("var(--field-border)");
    expect(FIELD.base["--vu-field-glow"]).toBe(
      "radial-gradient(var(--glow-r, 0px) circle at var(--mx, 50%) var(--my, 50%), var(--vu-glow), transparent 80%)",
    );
    const layers = splitTop(FIELD.base["--vu-field-layers"]!);
    expect(layers).toEqual([
      "var(--vu-field-ground) center / calc(100% - 2px) calc(100% - 2px) no-repeat padding-box",
      "var(--vu-field-glow) border-box padding-box",
      "var(--vu-field-ground) padding-box",
      "var(--vu-field-glow) border-box",
    ]);
    // The edge is the last layer: under the glow, and the colour wherever the
    // glow is not drawn.
    expect(FIELD.base.background).toBe("var(--vu-field-layers), var(--vu-field-edge) border-box");
    expect(FIELD.base["--vu-field-ground"]).toBe(
      "linear-gradient(var(--field-background), var(--field-background))",
    );
  });

  it("keeps the native select's chevron on top of the field's layers", () => {
    const layers = splitTop(FIELD.select.background!);
    expect(layers[0]).toMatch(/^url\("data:image\/svg\+xml,.*"\) right 0\.625rem center \/ 1rem no-repeat$/);
    expect(layers.slice(1)).toEqual(["var(--vu-field-layers)", "var(--vu-field-edge) border-box"]);
    expect(decls(".vu-select").appearance).toBe("none");
  });

  it("keeps a resting edge of 3:1 against the field and the page, and a glow that shows, everywhere", () => {
    for (const scope of SCOPES) {
      const vars = { ...scope.tokens, ...FIELD.base, ...(scope.band ? FIELD.band : {}) };
      const field = evaluate("var(--field-background)", vars);
      const edge = evaluate("var(--vu-field-edge)", vars);
      expect(contrast(edge, field), `${scope.name}: edge on the field`).toBeGreaterThanOrEqual(3);
      if (!scope.band) {
        expect(
          contrast(edge, evaluate("var(--background)", vars)),
          `${scope.name}: edge on the page`,
        ).toBeGreaterThanOrEqual(3);
      }
      // A glow the colour of the field would erase the edge it sits on.
      expect(
        contrast(evaluate("var(--vu-glow)", vars), field),
        `${scope.name}: the glow on the field`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("turns the glow red when the field is invalid, and off when it is disabled", () => {
    expect(FIELD.invalid["--vu-field-edge"]).toBe("var(--danger)");
    expect(FIELD.invalid["--vu-glow"]).toBe("var(--danger)");
    expect(FIELD.disabled["--vu-glow"]).toBe("transparent");
  });

  it("focuses with a 2px ring in the focus colour", () => {
    expect(FIELD.focus.outline).toBe("none");
    expect(FIELD.focus["border-color"]).toBe("var(--focus)");
    expect(splitTop(FIELD.focus["box-shadow"]!)[0]).toBe("0 0 0 1px var(--focus)");
  });

  it("does not animate the radius under reduced motion", () => {
    const reduced = declarations(blockOf(reducedMotion, ".vu-field", "  "));
    expect(reduced.transition).toBeTruthy();
    expect(reduced.transition).not.toContain("--glow-r");
  });

  it("is still what fieldClass, Input, Textarea and Select produce", () => {
    expect(fieldClass().split(" ")).toEqual(
      expect.arrayContaining(["vu-field", "border-field-border", "bg-field-background", "rounded-ctl"]),
    );
  });
});

describe("dropdown menus: Aceternity's navbar menu", () => {
  it("are marked by menuClass, which keeps everything it had", () => {
    expect(menuClass.split(" ")).toEqual(
      expect.arrayContaining([
        "vu-menu",
        "min-w-48",
        "overflow-hidden",
        "rounded-card",
        "border",
        "border-border",
        "bg-overlay",
        "p-1",
        "text-foreground",
        "shadow-e3",
      ]),
    );
    expect(menuItemClass).toContain("hover:bg-surface-muted");
  });

  it("rise into place from 8px and 96% on a spring-like curve, and keep no transform after", () => {
    const animation = MENU.base.animation!;
    expect(animation).toMatch(/^vu-menu-in (1[5-9]\d|2[0-5]\d)ms cubic-bezier\(/);
    // An overshooting curve: the second control point's y is above 1.
    const y1 = Number(/cubic-bezier\([^,]+,\s*([\d.]+)/.exec(animation)?.[1]);
    expect(y1).toBeGreaterThan(1);
    // Fill-mode backwards: a settled menu has no transform, so it creates no
    // containing block for anything fixed inside it and positions as before.
    expect(animation).toMatch(/\bbackwards$/);
    expect(MENU.base["transform-origin"]).toBe("top");
    const frames = blockOf(css, "@keyframes vu-menu-in");
    expect(frames).toMatch(/from\s*\{\s*opacity: 0;\s*transform: translateY\(8px\) scale\(0\.96\);/);
    expect(frames).toMatch(/to\s*\{\s*opacity: 1;\s*transform: none;/);
  });

  it("are slightly glassy, and their text stays legible whatever is behind them", () => {
    expect(MENU.base["background-color"]).toBe("color-mix(in oklab, var(--overlay) 94%, transparent)");
    expect(MENU.base["backdrop-filter"]).toMatch(/^blur\(\d+px\)/);
    expect(MENU.base["-webkit-backdrop-filter"]).toBe(MENU.base["backdrop-filter"]);
    for (const scope of SCOPES.filter((s) => !s.band)) {
      const vars = { ...scope.tokens, ...MENU.base };
      const glass = evaluate(MENU.base["background-color"]!, vars);
      for (const behind of [NAMED.black!, NAMED.white!, evaluate("var(--brand-fill)", vars)]) {
        const panel = over(glass, behind);
        for (const ink of ["foreground", "foreground-muted"]) {
          expect(
            contrast(evaluate(`var(--${ink})`, vars), panel),
            `${scope.name}: ${ink} on the glass`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("let the upward reaction picker keep its own pop", () => {
    expect(MENU.reaction.animation).toMatch(/^reaction-pop /);
    expect(MENU.reaction["transform-origin"]).toBe("bottom left");
  });

  it("fade without moving under reduced motion", () => {
    const reduced = declarations(blockOf(reducedMotion, ".vu-menu,\n  .vu-menu.reaction-pop", "  "));
    expect(reduced["animation-name"]).toBe("vu-menu-fade");
    const frames = blockOf(css, "@keyframes vu-menu-fade");
    expect(frames).toContain("opacity");
    expect(frames).not.toContain("transform");
  });
});

describe("disclosures: an animated native <details>", () => {
  const supports = blockOf(region, "@supports (interpolate-size: allow-keywords)");

  it("opens and closes by easing the content's height, only where the browser can", () => {
    expect(declarations(blockOf(supports, `${IN_APP} details`, "  "))["interpolate-size"]).toBe("allow-keywords");
    const closed = declarations(blockOf(supports, `${IN_APP} details::details-content`, "  "));
    const open = declarations(blockOf(supports, `${IN_APP} details[open]::details-content`, "  "));
    expect(closed["block-size"]).toBe("0");
    expect(closed.opacity).toBe("0");
    expect(closed["overflow-y"]).toBe("clip");
    expect(open["block-size"]).toBe("auto");
    expect(open.opacity).toBe("1");
    for (const transition of [closed.transition!, open.transition!]) {
      expect(transition).toMatch(/block-size \d+ms/);
      expect(transition).toMatch(/opacity \d+ms/);
      expect(transition).toMatch(/content-visibility \d+ms allow-discrete/);
    }
  });

  it("stops clipping once open, so a focus ring or a shadow at the edge is whole", () => {
    const open = declarations(blockOf(supports, `${IN_APP} details[open]::details-content`, "  "));
    expect(open["overflow-y"]).toBe("visible");
    const height = Number(/block-size (\d+)ms/.exec(open.transition!)?.[1]);
    const unclip = Number(/overflow-y 0s (\d+)ms allow-discrete/.exec(open.transition!)?.[1]);
    expect(unclip).toBe(height);
  });

  it("does not move at all under reduced motion", () => {
    const reduced = declarations(
      blockOf(
        reducedMotion,
        `${IN_APP} details::details-content,\n  ${IN_APP} details[open]::details-content`,
        "  ",
      ),
    );
    expect(reduced.transition).toBe("none");
  });
});

/* ------------------------------------------------------------------------ */
/* FieldGlow, driven without a browser                                      */
/* ------------------------------------------------------------------------ */

class FakeStyle {
  readonly props = new Map<string, string>();
  setProperty(name: string, value: string) {
    this.props.set(name, value);
  }
  removeProperty(name: string) {
    this.props.delete(name);
    return "";
  }
  getPropertyValue(name: string) {
    return this.props.get(name) ?? "";
  }
}

class FakeElement {
  readonly style = new FakeStyle();
  disabled = false;
  closestCalls = 0;
  private readonly attributes = new Map<string, string>();
  constructor(
    readonly parent: FakeElement | null,
    readonly classes: string[] = [],
    readonly rect = { left: 0, top: 0, width: 300, height: 36 },
  ) {}
  closest(selector: string): FakeElement | null {
    this.closestCalls += 1;
    expect(selector).toBe(FIELD_SELECTOR);
    return lineage(this).find((node) => node.classes.includes("vu-field")) ?? null;
  }
  matches(selector: string) {
    return selector === ":disabled" ? this.disabled : false;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  contains(other: unknown) {
    return lineage(other as FakeElement | null).includes(this);
  }
  getBoundingClientRect() {
    return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height };
  }
}

/** An element and its ancestors, nearest first. */
function lineage(start: FakeElement | null): FakeElement[] {
  const nodes: FakeElement[] = [];
  for (let node = start; node; node = node.parent) nodes.push(node);
  return nodes;
}

function harness() {
  const listeners: { type: string; listener: EventListener; options: AddEventListenerOptions }[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const env = {
    document: {
      addEventListener: (type: string, listener: EventListener, options: AddEventListenerOptions) => {
        listeners.push({ type, listener, options });
      },
      removeEventListener: (type: string, listener: EventListener, options: AddEventListenerOptions) => {
        const index = listeners.findIndex(
          (entry) => entry.type === type && entry.listener === listener && entry.options.capture === options.capture,
        );
        if (index !== -1) listeners.splice(index, 1);
      },
    } as unknown as GlowEnvironment["document"],
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    },
    cancelAnimationFrame: (handle: number) => {
      frames.delete(handle);
    },
  } satisfies GlowEnvironment;

  const page = new FakeElement(null);
  const field = new FakeElement(page, ["vu-field"], { left: 100, top: 40, width: 300, height: 36 });
  const child = new FakeElement(field); // an editor's paragraph
  const other = new FakeElement(page, ["vu-field"], { left: 100, top: 120, width: 300, height: 36 });

  const fire = (
    type: (typeof GLOW_EVENTS)[number],
    target: FakeElement,
    init: { x?: number; y?: number; related?: FakeElement | null; pointerType?: string } = {},
  ) => {
    const event = {
      type,
      target,
      relatedTarget: init.related ?? null,
      clientX: init.x ?? 0,
      clientY: init.y ?? 0,
      pointerType: init.pointerType ?? "mouse",
    } as unknown as Event;
    for (const entry of listeners.filter((e) => e.type === type)) entry.listener(event);
  };

  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };

  return { env, listeners, frames, fire, flush, page, field, child, other };
}

describe("FieldGlow", () => {
  it("renders nothing", () => {
    expect(renderToStaticMarkup(createElement(FieldGlow))).toBe("");
  });

  it("listens once, on the document, captured and passive, and lets go", () => {
    const h = harness();
    const detach = attachFieldGlow(h.env);
    expect(h.listeners.map((l) => l.type)).toEqual([...GLOW_EVENTS]);
    // One listener serves all three events.
    expect(new Set(h.listeners.map((l) => l.listener)).size).toBe(1);
    expect(h.listeners.every((l) => l.options.capture === true && l.options.passive === true)).toBe(true);
    detach();
    expect(h.listeners).toEqual([]);
  });

  it("lights the field under the pointer, measured from its own edge, once a frame", () => {
    const h = harness();
    attachFieldGlow(h.env);
    h.fire("pointerover", h.field, { x: 160, y: 50 });
    expect(h.field.style.props.size).toBe(0); // nothing until the frame
    h.fire("pointermove", h.field, { x: 170, y: 52 });
    h.fire("pointermove", h.field, { x: 180, y: 55 });
    expect(h.frames.size).toBe(1); // three events, one frame
    h.flush();
    expect(h.field.style.getPropertyValue("--mx")).toBe("80px");
    expect(h.field.style.getPropertyValue("--my")).toBe("15px");
    expect(h.field.style.getPropertyValue("--glow-r")).toBe(GLOW_RADIUS);
    expect(GLOW_RADIUS).toBe("100px");
  });

  it("follows into the field's own children and fades where it was on leaving", () => {
    const h = harness();
    attachFieldGlow(h.env);
    h.fire("pointerover", h.field, { x: 120, y: 50 });
    h.flush();
    h.fire("pointerout", h.field, { related: h.child });
    h.fire("pointerover", h.child, { x: 150, y: 60 });
    h.flush();
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("100px");
    expect(h.field.style.getPropertyValue("--mx")).toBe("50px");
    h.fire("pointerout", h.child, { related: h.page });
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("");
    // The position stays, so the registered radius shrinks in place.
    expect(h.field.style.getPropertyValue("--mx")).toBe("50px");
    h.fire("pointermove", h.page, { x: 10, y: 10 });
    h.flush();
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("");
  });

  it("moves from one field to the next", () => {
    const h = harness();
    attachFieldGlow(h.env);
    h.fire("pointerover", h.field, { x: 120, y: 50 });
    h.flush();
    h.fire("pointerover", h.other, { x: 130, y: 130 });
    h.flush();
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("");
    expect(h.other.style.getPropertyValue("--glow-r")).toBe("100px");
    expect(h.other.style.getPropertyValue("--my")).toBe("10px");
  });

  it("looks nothing up while the pointer moves outside a field", () => {
    const h = harness();
    attachFieldGlow(h.env);
    for (let i = 0; i < 20; i += 1) h.fire("pointermove", h.page, { x: i, y: i });
    expect(h.page.closestCalls).toBe(0);
    expect(h.frames.size).toBe(0);
  });

  it("does nothing for a touch", () => {
    const h = harness();
    attachFieldGlow(h.env);
    h.fire("pointerover", h.field, { x: 120, y: 50, pointerType: "touch" });
    h.fire("pointermove", h.field, { x: 125, y: 50, pointerType: "touch" });
    h.flush();
    expect(h.field.style.props.size).toBe(0);
  });

  it("does nothing over a disabled field, and lets go of one disabled under the pointer", () => {
    const h = harness();
    attachFieldGlow(h.env);
    h.field.disabled = true;
    h.fire("pointerover", h.field, { x: 120, y: 50 });
    h.flush();
    expect(h.field.style.props.size).toBe(0);

    h.other.setAttribute("aria-disabled", "true");
    h.fire("pointerover", h.other, { x: 120, y: 130 });
    h.flush();
    expect(h.other.style.props.size).toBe(0);

    // Enabled when the pointer arrives, disabled before the next frame (a form sending).
    h.field.disabled = false;
    h.fire("pointerover", h.field, { x: 120, y: 50 });
    h.flush();
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("100px");
    h.field.disabled = true;
    h.fire("pointermove", h.field, { x: 125, y: 50 });
    h.flush();
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("");
  });

  it("cancels a pending frame and clears the glow when detached", () => {
    const h = harness();
    const detach = attachFieldGlow(h.env);
    h.fire("pointerover", h.field, { x: 120, y: 50 });
    h.flush();
    h.fire("pointermove", h.field, { x: 130, y: 50 });
    expect(h.frames.size).toBe(1);
    detach();
    expect(h.frames.size).toBe(0);
    expect(h.field.style.getPropertyValue("--glow-r")).toBe("");
  });
});
