import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The button is built the way Polaris builds it.
 *
 * Values were read out of @shopify/polaris 13.9.5's shipped stylesheet rather
 * than guessed, and the library cannot be installed here — the React package is
 * deprecated and React-18-only, and the web components need App Bridge inside
 * Shopify Admin. So the construction is reproduced, and this is what keeps it
 * honest if someone later "simplifies" the shadows into one drop shadow.
 */

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("button construction", () => {
  it("uses Polaris's 8px radius", () => {
    expect(rule(".vu-btn")).toContain("border-radius: 0.5rem");
  });

  it("raises the secondary face with three stacked insets, not a drop shadow", () => {
    const secondary = rule(".vu-btn-secondary");
    // Bottom edge, hairline border, top gloss — the order matters, because the
    // gloss has to paint over the border to read as a lit top edge.
    expect(secondary).toContain("0 -1px 0 0 var(--btn-edge) inset");
    expect(secondary).toContain("0 0 0 1px var(--btn-hairline) inset");
    expect(secondary).toContain("0 0.5px 0 1.5px var(--btn-gloss) inset");
    // A drop shadow here would flatten the whole effect.
    expect(secondary).not.toMatch(/box-shadow:[^;]*\b0 1px 2px\b/);
  });

  it("sinks the face on press rather than only tinting it", () => {
    const pressed = rule(".vu-btn-secondary:active:not(:disabled)");
    // Shadow cast inwards from the top is what reads as depressed.
    expect(pressed).toContain("0 2px 1px 0 rgb(26 26 26 / 0.2) inset");
    expect(pressed).toContain("background-color");
  });

  it("gives the primary its bevel and collapses it on press", () => {
    expect(rule(".vu-btn-primary")).toContain(
      "0 -1px 0 1px rgb(0 0 0 / 0.8) inset",
    );
    expect(rule(".vu-btn-primary:active:not(:disabled)")).toContain(
      "box-shadow: 0 3px 0 0 rgb(0 0 0) inset",
    );
  });

  it("drops the bevel in dark mode, as Polaris does", () => {
    // A lit bevel on a black ground reads as a smudge; Polaris sets these to
    // none and carries the edge on a hairline instead.
    expect(css).toMatch(/\.dark,[\s\S]*?--btn-edge: transparent;/);
    expect(css).toMatch(/\.dark,[\s\S]*?--btn-gloss: transparent;/);
  });

  it("takes its colour from theme roles so it stays monochrome", () => {
    const primary = rule(".vu-btn-primary");
    expect(primary).toContain("var(--brand-fill)");
    expect(primary).toContain("var(--brand-fill-foreground)");
    // Polaris's own #303030 would be a third grey outside the token system.
    expect(primary).not.toContain("#303030");
  });

  it("is actually used by the buttons people click", () => {
    const surfaces = [
      "components/admin/ui.tsx",
      "components/feed/feed-rail.tsx",
      "components/app/app-header.tsx",
      "components/feed/post-follow-button.tsx",
    ];
    for (const file of surfaces) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, `${file} does not use the button`).toContain("vu-btn");
    }
  });
});
