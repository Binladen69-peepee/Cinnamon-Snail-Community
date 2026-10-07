import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One palette at a time, across the whole site (DEC-082, DEC-084).
 *
 * The marketing site and the sign-in pages paint from the blocks at the top of
 * `globals.css`; the member app and the admin console from the "App design
 * system" section at the end. Both are neutral grounds written by hand (white
 * but never pure white in light, black in dark) with amber and red reserved
 * for warning and danger, and blue and (only in the app) green for status.
 * The brand roles are not written by hand at all: `scripts/theme-accents.mjs`
 * generates them from `lib/theme/palettes.json`, the default palette (Royal
 * Blue) into marked regions inside the base blocks and every other palette
 * under its `data-accent`. This file holds the hand-written CSS to greys and
 * status hues, and each generated palette to its own hues.
 *
 * The reason for guarding it has not changed since the marketing palette was
 * first pinned (DEC-037): every surface paints from role tokens, so one stray
 * hue in those blocks repaints hundreds of components.
 */

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8").replace(/\r\n/g, "\n");

/** Where the app's palette starts. Everything before it is the marketing sheet. */
const APP_MARKER = "App design system: the member app and the admin console.";
const appStart = css.indexOf(APP_MARKER);
const marketingCss = css.slice(0, appStart);
const appCss = css.slice(appStart);

/** The regions the generator writes the default palette into. */
const GENERATED_REGION = /\/\* theme-default:([a-z-]+):start[\s\S]*?theme-default:\1:end \*\//g;
const withoutGenerated = (text: string) => text.replace(GENERATED_REGION, "");

/** The palettes, as the Theme dialog offers them. */
const registry = JSON.parse(readFileSync(resolve(root, "lib/theme/palettes.json"), "utf8")) as {
  default: string;
  palettes: { id: string; swatches: string[] }[];
};
const fallback = registry.palettes.find((palette) => palette.id === registry.default)!;

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
 * The hand-written marketing sheet's families. Gold and red are reserved: they
 * mean warning and danger, and they are never spent on decoration. The brand
 * is generated, so it is not here. Everything else is grey.
 */
const MARKETING_FAMILIES: [string, number, number][] = [
  ["gold / amber", 25, 60],
  ["red / terracotta", 0, 24],
];

/** The hand-written app sheet's families: the four status hues. */
const APP_FAMILIES: [string, number, number][] = [
  ["danger red", 0, 24],
  ["yellow / amber", 25, 60],
  ["success green", 120, 165],
  ["info blue", 200, 225],
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

/** The generated palettes (DEC-082), and the app sheet without them. */
const ACCENTS_START = "/* theme-accents:start";
const ACCENTS_END = "/* theme-accents:end */";
const accentsCss = css.slice(css.indexOf(ACCENTS_START), css.indexOf(ACCENTS_END));
const handWrittenAppCss = withoutGenerated(appCss.replace(accentsCss, ""));
const handWrittenMarketingCss = withoutGenerated(marketingCss);

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

  it("writes no hue by hand outside the two reserved families", () => {
    const hexes = handWrittenMarketingCss.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
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

  it("is white but never pure white in light, and black in dark, like the app", () => {
    // DEC-084: the site takes the app's grounds, which carry no hue.
    const light = blockAfter(":root,");
    const dark = blockAfter('[data-theme="dark"] {');
    expect(tokenIn(light, "background")).toBe("#f5f7fa");
    for (const role of ["background", "surface", "overlay", "field-background"]) {
      expect(tokenIn(light, role), `light --${role}`).not.toBe("#ffffff");
      expect(hue(tokenIn(light, role)), `light --${role} has no hue`).toBeNull();
    }
    expect(tokenIn(dark, "background")).toBe("#000000");
    expect(tokenIn(light, "background")).toBe(tokenIn(blockAfter(APP_LIGHT), "background"));
    expect(tokenIn(dark, "background")).toBe(tokenIn(blockAfter(APP_DARK), "background"));
  });

  it("brands the call to action, links and focus in the default palette, the same as the app", () => {
    const light = blockAfter(":root,");
    const dark = blockAfter('[data-theme="dark"] {');
    // The same filled blue on the landing page as on a primary button in the app.
    expect(tokenIn(light, "cta-fill")).toBe(tokenIn(blockAfter(APP_LIGHT), "brand-fill"));
    expect(tokenIn(dark, "cta-fill")).toBe(tokenIn(blockAfter(APP_DARK), "brand-fill"));
    const own = fallback.swatches.map(hue).filter((h): h is number => h !== null);
    for (const [block, role] of [
      [light, "cta-fill"],
      [light, "link"],
      [light, "focus"],
      [dark, "link"],
      [dark, "focus"],
    ] as const) {
      const h = hue(tokenIn(block, role));
      expect(h, role).not.toBeNull();
      expect(own.some((o) => Math.min(Math.abs(h! - o), 360 - Math.abs(h! - o)) <= 20), role).toBe(true);
    }
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
  it("is Royal Blue by default, from the client's reference, on neutral grounds", () => {
    expect(registry.default).toBe("royal");
    const light = blockAfter(APP_LIGHT);
    expect(tokenIn(light, "background")).toBe("#f5f7fa");
    expect(tokenIn(light, "surface")).toBe("#fcfdfe");
    expect(tokenIn(light, "foreground")).toBe("#171717");
    // The rail is the reference's navy, the fill its royal blue (a shade
    // deeper, so a white label clears 4.5:1 under the button's sheen).
    expect(tokenIn(light, "sidebar")).toBe(fallback.swatches[0]);
    expect(tokenIn(light, "brand-wash")).toBe(fallback.swatches[3]);
    expect(hue(tokenIn(light, "brand-fill"))).toBeGreaterThanOrEqual(212);
    expect(hue(tokenIn(light, "brand-fill"))).toBeLessThanOrEqual(228);
    // Counts and hearts are brand, never a third hue that could read as status.
    expect(tokenIn(light, "highlight")).toBe(tokenIn(light, "brand-fill"));
  });

  it("is white but never pure white in light mode, and black in dark mode", () => {
    // DEC-082: "dark mode uses black, light mode uses white (though not pure
    // white)". The grounds carry no hue, so every palette sits on them.
    const light = blockAfter(APP_LIGHT);
    const dark = blockAfter(APP_DARK);
    for (const role of ["background", "surface", "overlay", "field-background"]) {
      const value = tokenIn(light, role);
      expect(value, `light --${role}`).not.toBe("#ffffff");
      expect(contrast(value, "#ffffff"), `light --${role} is still white`).toBeLessThan(1.1);
      expect(hue(value), `light --${role} has no hue`).toBeNull();
    }
    expect(tokenIn(dark, "background")).toBe("#000000");
    for (const role of ["surface", "overlay", "default", "surface-muted"]) {
      expect(hue(tokenIn(dark, role)), `dark --${role} has no hue`).toBeNull();
    }
  });

  it("has no trace of the forest or teal palettes it replaced", () => {
    // DEC-077 retired forest, sage and terracotta from the app entirely; the
    // teal that followed (2026-10) is retired too: no green as brand or accent.
    for (const retired of ["#1f5a45", "#8faf96", "#d47755", "#f7f5ef", "#0d1512", "accent-sage", "#ffd447", "#0f746f", "#3ebfb6", "#5fd0c7"]) {
      expect(appCss.toLowerCase(), retired).not.toContain(retired);
    }
  });

  it("writes only greys and the status hues by hand", () => {
    // The palettes, the default included, are generated and held to their own
    // families below; everything written by hand is grey or status.
    const hexes = handWrittenAppCss.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const strays = [...new Set(hexes)]
      .filter((hex) => familyIn(APP_FAMILIES)(hex) === null)
      .map((hex) => `${hex} (hue ${hue(hex)}°)`);
    expect(strays).toEqual([]);
  });

  it("designs dark mode rather than inverting light", () => {
    // Plum #7b2d56 is too dim as text on the dark ground, so dark mode lifts
    // brand text to a rose-mauve and keeps the fill legible against its ground.
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

describe("member palettes (DEC-082, DEC-084)", () => {
  const chosen = registry.palettes.filter((palette) => palette.id !== registry.default);
  const scope = (id: string) => `[data-accent="${id}"]:has([data-app-shell], .vu-admin)`;
  const BAND = ":is(.vu-app-sidebar, .vu-admin-rail, .vu-band) {";
  const names = (block: string) => [...block.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]).sort();
  const regionIn = (name: string) => {
    const start = css.indexOf(`/* theme-default:${name}:start`);
    const end = css.indexOf(`/* theme-default:${name}:end */`);
    expect(start, `region ${name}`).toBeGreaterThan(-1);
    return css.slice(start, end);
  };

  it("generates exactly the palettes the dialog offers, from palettes.json, up to date", () => {
    const generated = [
      ...new Set([...accentsCss.matchAll(/data-accent="([a-z0-9-]+)"/g)].map((m) => m[1])),
    ].sort();
    expect(generated).toEqual(chosen.map((palette) => palette.id).sort());
    // The default needs no attribute: it is written into the base blocks, for
    // the site and the app, in both modes, and the band in both.
    expect(generated).not.toContain(registry.default);
    for (const region of ["site-light", "site-dark", "app-light", "app-dark", "band-light", "band-dark"]) {
      expect(names(regionIn(region)).length, region).toBeGreaterThan(5);
    }
    // The script refuses to write a pair that fails contrast, and --check
    // fails when globals.css has drifted from palettes.json.
    expect(() =>
      execFileSync(process.execPath, ["scripts/theme-accents.mjs", "--check"], {
        cwd: root,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("restates every light-mode token in dark mode, so dark never inherits a light brand colour", () => {
    for (const { id } of chosen) {
      expect(names(blockAfter(`:root.dark${scope(id)} {`)), id).toEqual(
        names(blockAfter(`:root${scope(id)} {`)),
      );
      // The same for the site's blocks.
      expect(names(blockAfter(`:root.dark[data-accent="${id}"],`)), `${id} site`).toEqual(
        names(blockAfter(`:root[data-accent="${id}"] {`)),
      );
      expect(names(blockAfter(`:root.dark${scope(id)} ${BAND}`)), `${id} band`).toEqual(
        names(blockAfter(`:root${scope(id)} ${BAND}`)),
      );
    }
  });

  it("re-points only brand roles, never the grounds or the status colours", () => {
    const grounds = /^(background|surface|surface-muted|overlay|foreground|default|border|separator|field-.*|success.*|warning.*|danger.*|info.*)$/;
    for (const { id } of chosen) {
      for (const marker of [`:root${scope(id)} {`, `:root.dark${scope(id)} {`]) {
        expect(names(blockAfter(marker)).filter((name) => grounds.test(name!)), marker).toEqual([]);
      }
    }
  });

  it("makes each palette's darkest colour the rail, and keeps every palette in its own hues", () => {
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) <= 20;
    for (const { id, swatches } of chosen) {
      expect(tokenIn(blockAfter(`:root${scope(id)} {`), "sidebar"), id).toBe(swatches[0]!.toLowerCase());
      const own = swatches.map(hue).filter((h): h is number => h !== null);
      const blocks = [
        `:root${scope(id)} {`,
        `:root.dark${scope(id)} {`,
        `:root${scope(id)} ${BAND}`,
        `:root.dark${scope(id)} ${BAND}`,
      ]
        .map(blockAfter)
        .join("\n");
      const strays = [...new Set(blocks.match(/#[0-9a-fA-F]{6}\b/g) ?? [])].filter((hex) => {
        const h = hue(hex);
        return h !== null && !own.some((o) => near(h, o));
      });
      expect(strays, id).toEqual([]);
    }
  });

  it("carries a legible primary button in every palette and mode", () => {
    for (const { id } of chosen) {
      for (const marker of [`:root${scope(id)} {`, `:root.dark${scope(id)} {`]) {
        const block = blockAfter(marker);
        expect(
          contrast(tokenIn(block, "brand-fill"), tokenIn(block, "brand-fill-foreground")),
          `${marker} label on a primary button`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
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
