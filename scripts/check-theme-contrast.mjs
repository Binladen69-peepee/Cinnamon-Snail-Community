#!/usr/bin/env node
/**
 * Does every pair this product actually paints clear WCAG?
 *
 * The palette validator in the dataviz toolkit answers a different question —
 * whether a reader can tell series 3 from series 4 in a chart. That is the
 * wrong test for a brand theme. The right one is whether each text-on-surface
 * pair the app really renders clears 4.5:1, and whether the boundaries that
 * identify a control clear 3:1 (WCAG 1.4.11).
 *
 * **It reads the tokens out of `app/globals.css` rather than holding a copy.**
 * A checker with its own copy of the palette passes forever while the real
 * theme drifts underneath it. Change a token, run this, and it tells you what
 * you broke.
 *
 *   node scripts/check-theme-contrast.mjs
 *
 * Exit code is non-zero when a pair fails, so it can gate a build.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Normalised, because the file is checked out with CRLF on Windows and the
// block selectors are matched across line breaks.
const CR = String.fromCharCode(13);
const css = readFileSync(resolve(here, "..", "app", "globals.css"), "utf8")
  .split(CR)
  .join("");

/** Pull `--name: #hex;` declarations out of one block, by its opening selector. */
function block(startsWith) {
  const at = css.indexOf(startsWith);
  if (at === -1) throw new Error(`Block not found: ${startsWith}`);
  const open = css.indexOf("{", at);
  // Brace-matching, because `.vu-admin` and friends contain nested rules.
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const tokens = {};
  for (const [, name, hex] of css
    .slice(open, end)
    .matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[name] = hex;
  }
  return tokens;
}

const relative = (hex) => {
  let v = hex.replace("#", "");
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [hi, lo] = [relative(a), relative(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * [foreground, background, minimum, what it is]
 *
 * 4.5 is body text. 3 is a control boundary or a large/graphical element.
 * Anything below that is a decorative edge, held only to being visible — a
 * resting card hairline is not a control and WCAG does not ask it to be 3:1.
 */
const PAIRS = [
  ["foreground", "background", 4.5, "body text on the ground"],
  ["foreground", "surface", 4.5, "body text on a card"],
  ["foreground-muted", "surface", 4.5, "secondary text on a card"],
  ["foreground-muted", "background", 4.5, "secondary text on the ground"],
  ["foreground-muted", "default", 4.5, "secondary text on a hover fill"],
  ["brand-strong", "surface", 4.5, "brand text on a card"],
  // The wash is a pale tile in dark mode and a pale tint in light, so what
  // sits on it is its own foreground, not the brand text colour.
  ["on-brand-wash", "brand-wash", 4.5, "text on a small tinted tile"],
  ["brand", "surface", 3, "brand icons and controls"],
  ["brand-fill-foreground", "brand-fill", 4.5, "label on a primary button"],
  ["danger", "surface", 4.5, "destructive text"],
  ["warning", "surface", 4.5, "warning text"],
  ["danger-foreground", "danger", 4.5, "label on a destructive fill"],
  ["field-foreground", "field-background", 4.5, "what you type in an input"],
  ["field-placeholder", "field-background", 4.5, "placeholder text"],
  ["link", "surface", 4.5, "a link in body copy"],
  ["focus", "surface", 3, "the focus ring"],
  ["field-border", "field-background", 1.3, "an input's edge"],
  ["hairline-firm", "surface", 1.4, "a firm hairline"],
  ["border", "surface", 1.1, "a resting card border"],
];

/** The sidebar resolves through `var()` in some scopes; skip what isn't literal. */
const SIDEBAR = [
  ["sidebar-foreground", "sidebar", 4.5, "nav label"],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5, "the active nav item"],
  ["foreground-muted", "sidebar", 4.5, "an inactive nav item"],
];

/**
 * Pairs held only in the app design system (DEC-076): its own roles, and a
 * field edge raised to WCAG 1.4.11's 3:1. The marketing site is frozen as it
 * is, so these are not applied to its blocks.
 */
const APP_PAIRS = [
  ["foreground-muted", "surface-muted", 4.5, "secondary text on a hover fill"],
  ["foreground-muted", "overlay", 4.5, "secondary text in a menu"],
  ["field-border", "field-background", 3, "an input's edge (WCAG 1.4.11)"],
  ["field-border", "background", 3, "an input's edge on the ground"],
  ["brand-fill", "background", 3, "a primary button against the ground"],
  ["highlight-ink", "surface", 4.5, "terracotta text on a card"],
  ["highlight-ink", "highlight-wash", 4.5, "terracotta text on its wash"],
  ["on-highlight", "highlight", 4.5, "a count on its terracotta badge"],
  ["highlight", "surface", 3, "a terracotta mark"],
  ["on-accent-sage", "accent-sage", 4.5, "text on a sage fill"],
  ["brand-strong", "accent-sage-wash", 4.5, "brand text on a sage wash"],
  ["success", "success-wash", 4.5, "a success badge"],
  ["warning", "warning-wash", 4.5, "a warning badge"],
  ["danger", "danger-wash", 4.5, "a danger badge"],
  ["info", "surface", 4.5, "info text"],
  ["info", "info-wash", 4.5, "an info badge"],
];

const SCOPES = [
  ["marketing — light", block(":root,\n  .light,"), false],
  ["marketing — dark", block(".dark,\n  [data-theme=\"dark\"]"), false],
  ["member app + console — light", block(":root:has([data-app-shell], .vu-admin) {"), true],
  ["member app + console — dark", block(":root.dark:has([data-app-shell], .vu-admin) {"), true],
];

let failures = 0;
let checked = 0;
let skipped = 0;

for (const [name, tokens, isApp] of SCOPES) {
  console.log(`\n=== ${name} ===`);
  for (const [fg, bg, min, what] of [...PAIRS, ...SIDEBAR, ...(isApp ? APP_PAIRS : [])]) {
    const a = tokens[fg];
    const b = tokens[bg];
    // A scope inherits anything it does not restate; only judge what it sets.
    if (!a || !b) {
      skipped += 1;
      continue;
    }
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) failures += 1;
    checked += 1;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(6)}:1 (min ${String(min).padEnd(3)}) ` +
        `${fg} on ${bg} — ${what}`,
    );
  }
}

console.log(
  `\n${checked} pairs checked, ${skipped} inherited and not restated in scope.`,
);
console.log(failures === 0 ? "ALL PAIRS PASS" : `${failures} PAIRS FAIL`);
process.exit(failures === 0 ? 0 : 1);
