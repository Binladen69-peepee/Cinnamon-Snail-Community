import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PressMarquee } from "@/components/marketing/press-marquee";
import {
  SENJA_HOMEPAGE_WIDGET,
  SENJA_MEMBERSHIP_WIDGET,
  SenjaEmbed,
} from "@/components/marketing/senja-embed";
import { PRESS_CREDITS } from "@/lib/marketing/assets";

/**
 * The two landing-page changes from the client's 2026-10-06 feedback, and
 * nothing more: the testimonials lose their white chip, and the cookbook
 * credit leaves the ticker. Both are checked as rendered markup, which is
 * what a visitor's browser receives.
 */

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("the hero testimonials", () => {
  const hero = renderToStaticMarkup(
    createElement(SenjaEmbed, {
      widgetId: SENJA_HOMEPAGE_WIDGET,
      title: "What members say",
      onPhoto: true,
    }),
  );

  it("sit in no container: nothing paints a ground behind them", () => {
    expect(hero).not.toContain("vu-hero-proof");
    expect(hero).not.toMatch(/\bbg-(white|surface|background|paper)\b/);
    expect(hero).not.toMatch(/background-color/);
    expect(hero).not.toMatch(/border(?!-)/);
    expect(hero).not.toMatch(/rounded/);
  });

  it("have only a very faint glow behind them", () => {
    expect(hero).toContain("data-senja-glow");
    const alphas = [...hero.matchAll(/rgb\(255 255 255 \/ ([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(alphas.length).toBeGreaterThan(0);
    for (const alpha of alphas) expect(alpha).toBeLessThanOrEqual(0.15);
    expect(hero).toContain("transparent 100%");
  });

  it("are set in white with the headline's shadow, so they read on the photograph", () => {
    expect(hero).toContain("text-white");
    expect(hero).toContain("vu-on-media");
    expect(css).toMatch(/\.vu-on-media\s*\{[^}]*text-shadow/);
  });

  it("keep the chip's box, so nothing else in the hero moves", () => {
    // The retired `.vu-hero-proof` chip was an inline-block with
    // `padding: 5px 22px; max-width: min(100%, 24rem)`. px-5.5 is 22px and
    // py-1.25 is 5px, so the widget sits exactly where it did.
    expect(hero).toContain("inline-block");
    expect(hero).toContain("max-w-[min(100%,24rem)]");
    expect(hero).toContain("px-5.5");
    expect(hero).toContain("py-1.25");
  });

  it("still mount the live widget", () => {
    expect(hero).toContain(`data-id="${SENJA_HOMEPAGE_WIDGET}"`);
    expect(hero).toContain('class="senja-embed"');
    expect(hero).toContain("What members say");
  });

  it("leave /membership's treatment exactly as it was", () => {
    const membership = renderToStaticMarkup(
      createElement(SenjaEmbed, { widgetId: SENJA_MEMBERSHIP_WIDGET, title: "What members say" }),
    );
    expect(membership).toContain("color-mix(in oklab, var(--surface) 90%, transparent)");
    expect(membership).toContain("mask-image");
    expect(membership).not.toContain("data-senja-glow");
    expect(membership).not.toContain("text-white");
    const page = readFileSync(resolve(process.cwd(), "app/(marketing)/membership/page.tsx"), "utf8");
    expect(page).not.toContain("onPhoto");
  });
});

describe("the press ticker", () => {
  const html = renderToStaticMarkup(createElement(PressMarquee));
  const tracks = [...html.matchAll(/(<ul[^>]*vu-marquee-track[^>]*>)([\s\S]*?)<\/ul>/g)].map(
    ([, open, body]) => ({ open: open!, body: body! }),
  );

  it("no longer carries the cookbook credit", () => {
    expect(PRESS_CREDITS).not.toContain("Street Vegan · Clarkson Potter");
    expect(html.toLowerCase()).not.toContain("street vegan");
    expect(html.toLowerCase()).not.toContain("clarkson potter");
  });

  it("keeps every other credit, in its order", () => {
    expect([...PRESS_CREDITS]).toEqual([
      "New York Times",
      "Food Network",
      "PBS",
      "VegNews",
      "James Beard House",
      "Vendy Cup winner",
    ]);
    for (const track of tracks) {
      const items = [...track.body.matchAll(/<li[^>]*>([^<]*)</g)].map((m) => m[1]);
      expect(items).toEqual([...PRESS_CREDITS]);
    }
  });

  it("hides the repeats from screen readers, as it hid the second copy before", () => {
    expect(html).toContain(`Featured in: ${PRESS_CREDITS.join(", ")}`);
    expect(tracks.length).toBe(4);
    // Only the first copy is read; the repeats exist for the loop.
    const hidden = tracks.map((track) => track.open.includes('aria-hidden="true"'));
    expect(hidden).toEqual([false, true, true, true]);
  });

  it("keeps its look: the same classes on the strip, the track and each credit", () => {
    expect(html).toContain('class="vu-marquee-wrap border-y border-sand/70 py-5"');
    expect(html).toContain(
      'class="flex shrink-0 items-center gap-8 whitespace-nowrap font-display text-sm font-bold uppercase tracking-[0.2em] text-olive"',
    );
    expect(html).toContain('class="size-1.5 rounded-full bg-accent/60"');
  });

  it("moves at the pace it always has", () => {
    // 38s moved one 1,587px copy of the old seven credits: ~41.8px a second.
    // Four copies of six move two copies (~2,400px) a loop at that pace.
    const seconds = Number(html.match(/animation-duration:\s*([\d.]+)s/)?.[1]);
    expect(seconds).toBeGreaterThan(55);
    expect(seconds).toBeLessThan(60);
  });
});
