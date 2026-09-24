import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The landing page's contract after the redesign.
 *
 * Each of these is something that was wrong on the live site and is invisible
 * in a unit test's world: a panel whose ink vanished in one theme, a sticky bar
 * that covered the button it duplicated, a bar with a control it should not
 * have and without one it should. They are pinned as source facts so the next
 * pass over this page cannot quietly undo them.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const page = read("app/(marketing)/page.tsx");
const css = read("app/globals.css");
const nav = read("components/layout/app-nav.tsx");
const layout = read("app/layout.tsx");

describe("the landing page carries no decorative SVG", () => {
  it("renders none of its own, and none of the retired art", () => {
    for (const file of [
      "app/(marketing)/page.tsx",
      "components/marketing/what-you-get.tsx",
      "components/marketing/membership-plans.tsx",
      "components/marketing/community-spread.tsx",
      "components/marketing/hero-words.tsx",
    ]) {
      const source = read(file);
      expect(source, `${file} draws an <svg>`).not.toMatch(/<svg\b/);
      expect(source, `${file} imports the leaf art`).not.toContain("hero-decor");
    }
  });

  it("no longer paints the globe or the site-wide leaves", () => {
    expect(existsSync(resolve(root, "components/marketing/community-globe.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "components/marketing/member-globe.tsx"))).toBe(false);
    expect(layout).not.toContain("BotanicalBackdrop");
  });
});

describe("the hero", () => {
  it("sets its headline in the brush face", () => {
    expect(layout).toContain("Oleo_Script_Swash_Caps");
    expect(layout).toContain("--font-brush");
    expect(css).toMatch(/\.vu-title-brush\s*\{[^}]*var\(--font-brush\)/);
    expect(page).toContain("vu-title-brush");
  });

  it("is exactly one screen tall on a phone", () => {
    // The section's top margin cancels the bar's height in flow, so the
    // section starts at zero and its height is the height you see. Adding the
    // bar's height back on top pushed the last card under the fold.
    expect(page).toMatch(/min-h-\[100svh\]/);
    expect(page).not.toMatch(/min-h-\[calc\(100svh\+/);
  });

  it("keeps the testimonial chip off the phone hero", () => {
    // `.vu-hero-proof` sets its own display later in the stylesheet, so a
    // `hidden` utility on the same element loses at equal specificity. The
    // breakpoint goes on a wrapper instead.
    // Scoped to a class attribute: the prose above it in the source explains
    // the trap and names both strings.
    expect(page).not.toMatch(/className="[^"]*vu-hero-proof[^"]*hidden/);
    expect(page).toMatch(/hidden self-center sm:block[\s\S]{0,200}vu-hero-proof/);
  });

  it("keeps the signed-off copy verbatim", () => {
    // The words are the client's. The page may animate them, size them and
    // colour them, and may not change one of them.
    expect(page).toContain("HOMEPAGE_HERO.headline");
    expect(page).toContain("HOMEPAGE_HERO.subhead");
    expect(page).toContain("KITCHEN_TABLE_BLOCK.paragraphs");
    expect(page).toContain("MEMBERSHIP_TEASER.body");
  });

  it("animates word by word without hiding the sentence from assistive tech", () => {
    const words = read("components/marketing/hero-words.tsx");
    expect(words).toContain("vu-hero-word");
    expect(words).toContain("aria-hidden");
    expect(page).toMatch(/<h1[^>]*aria-label=\{HOMEPAGE_HERO\.headline\}/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.vu-hero-word/);
  });
});

describe("both themes read", () => {
  it("keeps the dark panel's ink light in both", () => {
    // The panel is dark in light mode and dark in dark mode, so its text is
    // white in both. Built from a token, it inverted to black-on-black.
    expect(css).toMatch(/\.vu-panel-dark\s*\{[^}]*color:\s*#ffffff/);
    expect(page).not.toMatch(/vu-panel-dark[\s\S]{0,1500}text-paper/);
  });

  it("keeps the testimonial chip white in both", () => {
    // The widget draws dark type we do not control.
    expect(css).toMatch(/\.vu-hero-proof\s*\{[^}]*background:\s*#ffffff/);
  });

  it("lets the featured plan's button be seen", () => {
    const plans = read("components/marketing/membership-plans.tsx");
    expect(plans).not.toContain('featured && "bg-brand-fill');
  });
});

describe("the bar", () => {
  it("offers light and dark to visitors", () => {
    expect(nav).toContain("ThemeToggle");
  });

  it("has no messages control", () => {
    expect(nav).not.toContain('icon="messages"');
    expect(nav).not.toContain("totalUnreadForUser");
  });

  it("sets the lockup on one fixed-height line", () => {
    const brand = read("components/brand/brand-mark.tsx");
    expect(brand).toMatch(/h-10[^"]*items-center/);
  });
});

describe("the sticky bar", () => {
  it("waits for the hero to leave the screen", () => {
    // It used to watch a sentinel below the hero, which at the top of the
    // page was already off screen — so it showed at once, over the hero's own
    // button.
    const sticky = read("components/marketing/sticky-checkout.tsx");
    expect(sticky).toContain('querySelector<HTMLElement>("[data-hero-dark]")');
    expect(sticky).not.toContain("rootMargin: \"-120px");
  });
});
