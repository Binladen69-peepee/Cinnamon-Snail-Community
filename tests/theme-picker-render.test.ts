import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The Theme picker as a browser receives it: the rail button, the dialog
 * shell, its body, and the Aceternity parts they are built from.
 *
 * Not a visual test (nothing here can paint), but it holds what a keyboard
 * and a screen reader depend on: a button that says it opens a dialog, a
 * dialog named and described by its own title, radio groups with one tab
 * stop and a checked state, accordion headers that control labelled regions,
 * and a preview that cannot be focused or read as controls.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/kitchen-table" }));

const { ThemeButton } = await import("@/components/theme/theme-button");
const { ThemePanel } = await import("@/components/theme/theme-panel");
const { ThemeDialog } = await import("@/components/theme/theme-dialog");
const { STRIP_SHOWN_WHEN } = await import("@/components/theme/palette-strip");
const { AnimatedModal, ModalClose } = await import("@/components/aceternity/animated-modal");
const { Accordion, AccordionItem } = await import("@/components/aceternity/accordion");
const { PillRadioGroup } = await import("@/components/aceternity/pill-radio-group");
const { SideRail } = await import("@/components/app/side-rail");
const { AdminSidebar } = await import("@/components/admin/admin-sidebar");
const { AdminMobileNav } = await import("@/components/admin/admin-mobile-nav");
const { PALETTES, DEFAULT_PALETTE } = await import("@/lib/theme/palettes");

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

/** Opening tags carrying an attribute, e.g. every `role="radio"`. */
const tagsWith = (html: string, attribute: string) =>
  [...html.matchAll(/<[a-z0-9]+\b[^>]*>/g)].map(([tag]) => tag).filter((tag) => tag.includes(attribute));

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The text of the element with this id. */
const textOf = (html: string, id: string) => {
  const match = new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([^<]*)<`).exec(html);
  return match?.[1];
};

/** One radio group's markup: from its opening tag to the next group. */
function group(html: string, labelText: string) {
  const groups = [...html.matchAll(/<div role="radiogroup"[^>]*>/g)];
  for (const [index, found] of groups.entries()) {
    const id = attr(found[0], "aria-labelledby");
    if (id && textOf(html, id) === labelText) {
      const end = groups[index + 1]?.index ?? html.length;
      return html.slice(found.index, end);
    }
  }
  throw new Error(`no radio group labelled ${labelText}`);
}

describe("the Theme button", () => {
  it("is a button that says it opens a dialog, closed to begin with", () => {
    const html = render(createElement(ThemeButton));
    const [button] = tagsWith(html, "aria-haspopup");
    expect(button).toMatch(/^<button type="button"/);
    expect(attr(button!, "aria-haspopup")).toBe("dialog");
    expect(attr(button!, "aria-expanded")).toBe("false");
    expect(html).toContain(">Theme</span>");
  });

  it("is built like the rail's rows, with a 40px touch target", () => {
    const [button] = tagsWith(render(createElement(ThemeButton)), "aria-haspopup");
    for (const part of ["h-9", "rounded-ctl", "text-label", "font-medium", "text-foreground-muted", "hover:bg-surface-muted"]) {
      expect(button, part).toContain(part);
    }
    expect(button).toContain("before:-inset-y-0.5");
  });

  it("names the palette in use for a screen reader, Royal Blue before hydration", () => {
    expect(render(createElement(ThemeButton))).toContain('<span class="sr-only">, Royal Blue</span>');
  });

  it("carries every palette's strip, with CSS showing the one in use from the first paint", () => {
    const html = render(createElement(ThemeButton));
    const strips = [...html.matchAll(/<span aria-hidden="true" class="h-3 [^"]*">((?:<span [^>]*><\/span>){4})<\/span>/g)];
    expect(strips).toHaveLength(PALETTES.length);
    for (const [index, palette] of PALETTES.entries()) {
      const colours = [...strips[index]![1]!.matchAll(/background-color:(#[0-9a-f]{6})/g)].map((m) => m[1]);
      expect(colours, palette.id).toEqual([...palette.swatches]);
      expect(strips[index]![0], palette.id).toContain(STRIP_SHOWN_WHEN[palette.id].replace(/&/g, "&amp;"));
    }
  });

  it("shows the default strip unless another palette is on <html>, and each other strip only for its own", () => {
    for (const palette of PALETTES) {
      const classes = STRIP_SHOWN_WHEN[palette.id];
      if (palette.id === DEFAULT_PALETTE) {
        expect(classes).toMatch(/^flex /);
        expect(classes).toContain(`[:root[data-accent]:not([data-accent=${DEFAULT_PALETTE}])_&]:hidden`);
      } else {
        expect(classes).toBe(`hidden [:root[data-accent=${palette.id}]_&]:flex`);
      }
    }
  });

  it("has a square variant for a bar, named for a screen reader", () => {
    const html = render(createElement(ThemeButton, { variant: "icon" }));
    const [button] = tagsWith(html, "aria-haspopup");
    expect(button).toContain("size-9");
    expect(button).toContain("before:-inset-0.5");
    expect(attr(button!, "aria-expanded")).toBe("false");
    expect(html).toContain('<span class="sr-only">Theme, Royal Blue</span>');
  });
});

describe("where the Theme button sits", () => {
  it("is at the foot of the member rail, which the phone drawer reuses", () => {
    const html = render(createElement(SideRail, { unread: {} }));
    const nav = html.indexOf("</nav>");
    const theme = html.indexOf('aria-haspopup="dialog"');
    expect(theme).toBeGreaterThan(nav);
    expect(html).toMatch(/<li><button type="button" aria-haspopup="dialog"/);
  });

  it("follows the staff console row, which stays", () => {
    const html = render(createElement(SideRail, { unread: {}, staff: true }));
    const admin = html.indexOf('href="/admin"');
    expect(admin).toBeGreaterThan(-1);
    expect(html.indexOf('aria-haspopup="dialog"')).toBeGreaterThan(admin);
  });

  it("is at the foot of the console rail", () => {
    const html = render(createElement(AdminSidebar, { name: "Ada", role: "Super admin", avatarUrl: null }));
    const nav = html.indexOf("</nav>");
    const theme = html.indexOf('aria-haspopup="dialog"');
    expect(theme).toBeGreaterThan(nav);
    expect(theme).toBeLessThan(html.indexOf("Back to the community"));
  });

  it("is in the console's phone bar", () => {
    const html = render(createElement(AdminMobileNav, { name: "Ada", role: "Super admin", avatarUrl: null }));
    const [button] = tagsWith(html, 'aria-haspopup="dialog"');
    expect(button).toContain("ml-auto");
    expect(html).toContain("Theme, Royal Blue");
  });
});

describe("the Theme dialog", () => {
  const dialog = () => render(createElement(ThemeDialog, { open: true, onClose: () => {}, portal: false }));

  it("is a modal dialog named by its title and described by its line", () => {
    const html = dialog();
    const [panel] = tagsWith(html, 'role="dialog"');
    expect(attr(panel!, "aria-modal")).toBe("true");
    expect(attr(panel!, "tabindex")).toBe("-1");
    expect(textOf(html, attr(panel!, "aria-labelledby")!)).toBe("Theme");
    expect(textOf(html, attr(panel!, "aria-describedby")!)).toBe(
      "Choose a palette and a mode. Saved on this device.",
    );
    expect(html).toMatch(/<h2 id="[^"]+"[^>]*>Theme<\/h2>/);
  });

  it("is painted from tokens, near full width on a phone and about 680px on a desktop", () => {
    const [panel] = tagsWith(dialog(), 'role="dialog"');
    for (const part of ["bg-overlay", "border-border", "rounded-modal", "shadow-e3", "max-h-[90dvh]", "w-full", "sm:max-w-170"]) {
      expect(panel, part).toContain(part);
    }
    expect(dialog()).toContain("bg-backdrop backdrop-blur-md");
  });

  it("has a labelled close button, Reset to default and Done", () => {
    const html = dialog();
    expect(html).toMatch(/<button type="button" aria-label="Close"/);
    expect(html).toMatch(/vu-btn-secondary[^>]*>(?:<svg[\s\S]*?<\/svg>)?Reset to default<\/button>/);
    expect(html).toMatch(/vu-btn-primary[^>]*>Done<\/button>/);
  });

  it("speaks its messages through a polite live region", () => {
    expect(dialog()).toContain('<p aria-live="polite" class="sr-only"></p>');
  });

  it("renders nothing while closed", () => {
    expect(render(createElement(ThemeDialog, { open: false, onClose: () => {}, portal: false }))).toBe("");
  });

  it("tilts in, and only fades with reduced motion", async () => {
    // The tilt is the entrance; reduced motion is checked in the component.
    const [panel] = tagsWith(dialog(), 'role="dialog"');
    expect(attr(panel!, "style")).toContain("rotateX(40deg)");
    const source = (await import("node:fs")).readFileSync(
      "components/aceternity/animated-modal.tsx",
      "utf8",
    );
    expect(source).toMatch(/useReducedMotion\(\)/);
    expect(source).toMatch(/FADED = \{\s*initial: \{ opacity: 0 \},\s*animate: \{ opacity: 1 \},\s*exit: \{ opacity: 0 \}/);
  });
});

describe("the dialog body", () => {
  const html = render(createElement(ThemePanel));

  it("offers Light, Dark and System as one radio group with one tab stop", () => {
    const mode = group(html, "Mode");
    const radios = tagsWith(mode, 'role="radio"');
    expect(radios).toHaveLength(3);
    expect([...mode.matchAll(/<span class="truncate">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    // next-themes only knows the setting in the browser: nothing is checked
    // in the server's markup, and the first option is the tab stop.
    expect(radios.map((tag) => attr(tag, "aria-checked"))).toEqual(["false", "false", "false"]);
    expect(radios.map((tag) => attr(tag, "tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(radios.every((tag) => tag.startsWith('<button type="button"'))).toBe(true);
  });

  it("offers every palette, in order, as one radio group with Royal Blue chosen by default", () => {
    const palettes = group(html, "Palette");
    const radios = tagsWith(palettes, 'role="radio"');
    expect(radios).toHaveLength(PALETTES.length);
    const names = radios.map((tag) =>
      attr(tag, "aria-labelledby")!
        .split(" ")
        .map((id) => textOf(palettes, id))
        .join(" "),
    );
    expect(names).toEqual(PALETTES.map((p) => (p.id === DEFAULT_PALETTE ? `${p.name} Default` : p.name)));
    expect(radios.map((tag) => attr(tag, "aria-describedby")).map((id) => textOf(palettes, id!))).toEqual(
      PALETTES.map((p) => p.description),
    );
    expect(radios.map((tag) => attr(tag, "aria-checked"))).toEqual(
      PALETTES.map((p) => String(p.id === DEFAULT_PALETTE)),
    );
    expect(radios.filter((tag) => attr(tag, "tabindex") === "0")).toHaveLength(1);
    expect(attr(radios[0]!, "tabindex")).toBe("0");
  });

  it("draws each palette as four bands, darkest and tallest at the top, with its code there", () => {
    const palettes = group(html, "Palette");
    for (const palette of PALETTES) {
      const bands = [...palettes.matchAll(/style="background-color:(#[0-9a-f]{6});height:(\d+)%"/g)]
        .filter((m) => palette.swatches.includes(m[1]!))
        .slice(0, 4);
      expect(bands.map((m) => m[1]), palette.id).toEqual([...palette.swatches]);
      expect(bands.map((m) => Number(m[2]))).toEqual([38, 24, 19, 19]);
      expect(palettes).toContain(`>${palette.swatches[0]}</span>`);
    }
    // The code shows on hover and on keyboard focus, in the rail's ink.
    expect(palettes).toContain("group-hover/palette:opacity-100 group-focus-visible/palette:translate-y-0 group-focus-visible/palette:opacity-100");
    expect(palettes).toContain("text-sidebar-foreground opacity-0");
  });

  it("marks the chosen palette with a ring and a check, and glows on hover and focus", () => {
    const palettes = group(html, "Palette");
    const [chosen] = tagsWith(palettes, 'aria-checked="true"');
    expect(chosen).toContain("border-brand inset-ring-1 inset-ring-brand");
    expect(chosen).toContain("focus-visible:[--glow-on:1]");
    expect(palettes.match(/bg-brand-fill text-brand-fill-foreground/g)).toHaveLength(1);
    expect(palettes.match(/opacity:max\(var\(--glow-active\), var\(--glow-on, 0\)\)/g)).toHaveLength(PALETTES.length);
  });

  it("lays the palettes out two across on a phone and three from sm", () => {
    expect(group(html, "Palette")).toMatch(/^<div role="radiogroup" aria-labelledby="[^"]+" class="grid grid-cols-2 gap-3 sm:grid-cols-3">/);
  });

  it("previews the palette with the app's own parts, none of which can be focused", () => {
    const preview = /<section aria-label="Preview"[\s\S]*?<\/section>/.exec(html)?.[0];
    expect(preview).toBeDefined();
    const [sample] = tagsWith(preview!, "inert");
    expect(attr(sample!, "aria-hidden")).toBe("true");
    expect(preview).toMatch(/<button type="button" class="vu-btn [^"]*vu-btn-primary[^"]*" tabindex="-1">Get started<\/button>/);
    expect(preview).toMatch(/vu-btn-secondary[^"]*" tabindex="-1">/);
    const [field] = tagsWith(preview!, "placeholder=");
    expect(attr(field!, "placeholder")).toBe("Search classes…");
    expect(field).toMatch(/readOnly=""/i);
    expect(attr(field!, "tabindex")).toBe("-1");
    expect(preview).toContain("vu-band");
    expect(preview).toContain("bg-brand-wash text-on-brand-wash");
    expect(preview).toContain("text-link underline");
    expect(preview).toMatch(/<p class="sr-only">A sample of the app in the Royal Blue palette/);
  });

  it("puts the details in an accordion of buttons that control labelled regions", () => {
    const triggers = tagsWith(html, "data-accordion-trigger");
    expect(triggers).toHaveLength(2);
    const titles: string[] = [];
    for (const trigger of triggers) {
      expect(trigger).toMatch(/^<button type="button"/);
      expect(attr(trigger, "aria-expanded")).toBe("false");
      const panelId = attr(trigger, "aria-controls")!;
      const [region] = tagsWith(html, `id="${panelId}"`);
      expect(attr(region!, "role")).toBe("region");
      expect(attr(region!, "aria-labelledby")).toBe(attr(trigger, "id"));
      expect(region).toMatch(/\shidden=""/);
      const title = new RegExp(`id="${attr(trigger, "id")}"[\\s\\S]*?<span class="min-w-0 flex-1">([^<]+)<`).exec(html);
      titles.push(title![1]!);
    }
    expect(titles).toEqual(["Palette colours", "How this is saved"]);
    // Each header sits in a heading, as the pattern asks.
    expect(html).toMatch(/<h3 class="m-0 [^"]*"><button type="button" id="[^"]+" aria-expanded="false"/);
  });

  it("lists the palette's four codes, each with a copy button that names it", () => {
    const fallback = PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;
    for (const swatch of fallback.swatches) {
      const code = swatch.toUpperCase();
      expect(html).toContain(`>${code}</span>`);
      expect(html).toMatch(new RegExp(`>Copy<span class="sr-only"> ${code}</span></button>`));
    }
  });

  it("explains where the choice is kept", () => {
    expect(html).toContain("kept in this browser");
    expect(html).toContain("the member app and the admin console");
    // DEC-084: the palette follows the member onto the public pages too.
    expect(html).toContain("the home page and");
    expect(html).not.toContain("house colours");
  });
});

describe("the Aceternity parts on their own", () => {
  it("modal: closed renders nothing; open is a labelled dialog with its close button", () => {
    const props = { onClose: () => {}, labelledBy: "t", describedBy: "d", portal: false };
    expect(render(createElement(AnimatedModal, { ...props, open: false }, "x"))).toBe("");
    const html = render(
      createElement(
        AnimatedModal,
        { ...props, open: true },
        createElement("h2", { id: "t" }, "Title"),
        createElement(ModalClose, { label: "Close the thing" }),
      ),
    );
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="t" aria-describedby="d" tabindex="-1"');
    expect(html).toContain('aria-label="Close the thing"');
  });

  it("radio pills: the chosen option is checked, the tab stop, and carries the pill", () => {
    const html = render(
      createElement(PillRadioGroup<"a" | "b" | "c">, {
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
          { value: "c", label: "C" },
        ],
        value: "b",
        onChange: () => {},
        label: "Letters",
        tone: "brand",
      }),
    );
    expect(html).toContain('<div role="radiogroup" aria-label="Letters"');
    const radios = tagsWith(html, 'role="radio"');
    expect(radios.map((tag) => attr(tag, "aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map((tag) => attr(tag, "tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(html.match(/bg-brand-fill/g)).toHaveLength(1);
    expect(radios[1]).toContain("text-brand-fill-foreground");
  });

  it("accordion: an item open from the start is expanded and its region shown", () => {
    const html = render(
      createElement(
        Accordion,
        { defaultValue: ["one"], headingLevel: 4 },
        createElement(AccordionItem, { value: "one", title: "One" }, "First"),
        createElement(AccordionItem, { value: "two", title: "Two" }, "Second"),
      ),
    );
    const [one, two] = tagsWith(html, "data-accordion-trigger");
    expect(attr(one!, "aria-expanded")).toBe("true");
    expect(attr(two!, "aria-expanded")).toBe("false");
    const [openRegion] = tagsWith(html, `id="${attr(one!, "aria-controls")}"`);
    const [closedRegion] = tagsWith(html, `id="${attr(two!, "aria-controls")}"`);
    expect(openRegion).not.toMatch(/\shidden=""/);
    expect(closedRegion).toMatch(/\shidden=""/);
    expect(html).toMatch(/<h4 class="m-0/);
  });
});
