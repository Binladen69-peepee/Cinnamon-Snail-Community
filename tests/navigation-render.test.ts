import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The member chrome as a browser receives it: the rail (which the drawer
 * reuses) and the phone tab bar, rendered at a given address.
 */

const location = vi.hoisted(() => ({ pathname: "/kitchen-table" }));

vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
}));

const { SideRail } = await import("@/components/app/side-rail");
const { MobileTabs } = await import("@/components/app/mobile-tabs");

const rail = (props: { unread?: Record<string, number>; staff?: boolean } = {}) =>
  renderToStaticMarkup(createElement(SideRail, { unread: props.unread ?? {}, staff: props.staff }));

const linkLabels = (html: string) =>
  [...html.matchAll(/<a [^>]*>[\s\S]*?<span class="min-w-0 flex-1 truncate">([^<]+)<\/span>/g)].map(
    (match) => match[1]!.replace(/&amp;/g, "&"),
  );

beforeEach(() => {
  location.pathname = "/kitchen-table";
});

describe("the rail, rendered", () => {
  it("shows Community then Learning, and nothing else", () => {
    const html = rail();
    expect(linkLabels(html)).toEqual([
      "Kitchen Table",
      "Bulletin Board",
      "Members",
      "Connect",
      "Messages",
      "Classes",
      "Live Classes",
      "Roadmap",
      "Ideas & Requests",
    ]);
    const headings = [...html.matchAll(/<p class="[^"]*uppercase[^"]*">([^<]+)<\/p>/g)].map((m) => m[1]);
    expect(headings).toEqual(["Community", "Learning"]);
  });

  it("carries no tagline, no room list and no hash glyphs", () => {
    const html = rail();
    expect(html).not.toContain("Better food");
    expect(html).not.toContain("Kinder planet");
    expect(html).not.toMatch(/>#\s/);
    for (const retired of ["Explorer", "Spaces", "Drafts", "Local"]) {
      expect(html).not.toContain(`>${retired}<`);
    }
  });

  it("marks the page the member is on, and only that one", () => {
    location.pathname = "/live-classes/winter-soups";
    const html = rail();
    const current = [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>[\s\S]*?truncate">([^<]+)</g)].map(
      (m) => m[1],
    );
    expect(current).toEqual(["Live Classes"]);
  });

  it("shows the unread count on Messages", () => {
    const html = rail({ unread: { "/messages": 3 } });
    expect(html).toMatch(/Messages<\/span>[\s\S]{0,200}3 unread/);
  });

  it("offers the console to staff only", () => {
    expect(rail()).not.toContain('href="/admin"');
    expect(rail({ staff: true })).toContain('href="/admin"');
  });

  it("sends the wordmark to the Kitchen Table", () => {
    expect(rail()).toMatch(/href="\/kitchen-table"[^>]*data-brand|data-brand[^>]*href="\/kitchen-table"/);
  });
});

describe("the phone tabs, rendered", () => {
  it("are Kitchen Table, Classes, Create, Live and Messages", () => {
    const html = renderToStaticMarkup(createElement(MobileTabs));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/kitchen-table", "/learn", "/compose", "/live-classes", "/messages"]);
    expect(html).toContain('aria-label="Kitchen Table"');
    expect(html).toContain('aria-label="Live Classes"');
    expect(html).toContain('aria-label="Create a post"');
    expect(html).not.toContain(">Search<");
    expect(html).not.toContain(">Explorer<");
  });

  it("lights the Kitchen Table on a post", () => {
    location.pathname = "/posts/abc";
    const html = renderToStaticMarkup(createElement(MobileTabs));
    const current = [...html.matchAll(/<a [^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/kitchen-table"');
  });
});
