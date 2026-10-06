import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LINKS,
  MEMBER_DESTINATIONS,
  MEMBER_HOME_HREF,
  MEMBER_NAV_GROUPS,
  MEMBER_NAV_LINKS,
  MOBILE_TABS,
  isNavActive,
  withMemberDestinations,
} from "@/lib/navigation";
import { ADMIN_NAV, ADMIN_NAV_ITEMS, activeAdminHref } from "@/lib/admin/nav";
import { NAV_SECTION_SUGGESTIONS, filterSuggestions } from "@/lib/search/suggest";

/**
 * The member menu after the client's 2026-10-06 feedback.
 *
 * Community is exactly five places, Learning four, and the retired entries
 * (Explorer, Spaces, Drafts, Local, the tagline, the per-room list) stay gone
 * from every surface that draws the menu: the rail, the drawer that reuses it,
 * the phone tabs, the phone sheet and the search palette.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const shape = (links: { href: string; label: string }[]) =>
  links.map(({ href, label }) => ({ href, label }));

describe("the member menu", () => {
  it("has a Community group of exactly the five places the client named", () => {
    const community = MEMBER_NAV_GROUPS.find((group) => group.label === "Community");
    expect(shape(community?.links ?? [])).toEqual([
      { href: "/kitchen-table", label: "Kitchen Table" },
      { href: "/bulletin", label: "Bulletin Board" },
      { href: "/members", label: "Members" },
      { href: "/connect", label: "Connect" },
      { href: "/messages", label: "Messages" },
    ]);
  });

  it("has a Learning group of classes, live classes, the roadmap and ideas", () => {
    const learning = MEMBER_NAV_GROUPS.find((group) => group.label === "Learning");
    expect(shape(learning?.links ?? [])).toEqual([
      { href: "/learn", label: "Classes" },
      { href: "/live-classes", label: "Live Classes" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/ideas", label: "Ideas & Requests" },
    ]);
  });

  it("has no other groups, so Bulletin Board is no longer under Local", () => {
    expect(MEMBER_NAV_GROUPS.map((group) => group.label)).toEqual(["Community", "Learning"]);
  });

  it("lists nothing that was retired", () => {
    const labels = MEMBER_NAV_LINKS.map((link) => link.label);
    const hrefs = MEMBER_NAV_LINKS.map((link) => link.href);
    for (const retired of ["Explorer", "Spaces", "Drafts", "Local", "Events", "Courses"]) {
      expect(labels, retired).not.toContain(retired);
    }
    for (const retired of ["/home", "/spaces", "/drafts", "/calendar"]) {
      expect(hrefs, retired).not.toContain(retired);
    }
  });

  it("makes the Kitchen Table the member's home", () => {
    expect(MEMBER_HOME_HREF).toBe("/kitchen-table");
  });

  it("keeps Drafts reachable from the account menu instead", () => {
    expect(ACCOUNT_LINKS.map((link) => link.href)).toContain("/drafts");
    expect(read("components/app/account-menu.tsx")).toContain("ACCOUNT_LINKS");
  });
});

describe("the rail", () => {
  const rail = read("components/app/side-rail.tsx");
  const layout = read("app/(member)/layout.tsx");

  it("draws the shared menu rather than a list of its own", () => {
    expect(rail).toContain("MEMBER_NAV_GROUPS");
    expect(rail).not.toMatch(/const (PRIMARY|SECTIONS)\b/);
  });

  it("no longer carries the tagline", () => {
    expect(rail).not.toContain("Better food");
    expect(rail).not.toContain("Kinder planet");
  });

  it("no longer lists spaces, with their # and emoji glyphs", () => {
    expect(rail).not.toContain("SpaceRow");
    expect(rail).not.toContain("SPACE_KIND_ICON");
    expect(rail).not.toMatch(/`# \$\{/);
    expect(rail).not.toContain("space.icon");
    expect(layout).not.toContain("listNavSpaces");
  });

  it("keeps the unread count on Messages", () => {
    expect(layout).toMatch(/"\/messages":\s*unreadMessages/);
  });

  it("points the wordmark at the Kitchen Table, here and in the bar", () => {
    expect(rail).toContain("MEMBER_HOME_HREF");
    expect(read("components/app/app-header.tsx")).toContain("MEMBER_HOME_HREF");
    expect(read("components/admin/admin-sidebar.tsx")).toContain("MEMBER_HOME_HREF");
  });
});

describe("the phone", () => {
  it("tabs Kitchen Table, Classes, Create, Live and Messages", () => {
    expect(MOBILE_TABS.map((tab) => tab.href)).toEqual([
      "/kitchen-table",
      "/learn",
      "/compose",
      "/live-classes",
      "/messages",
    ]);
    expect(MOBILE_TABS.map((tab) => tab.shortLabel ?? tab.label)).toEqual([
      "Kitchen",
      "Classes",
      "Create",
      "Live",
      "Messages",
    ]);
    expect(MOBILE_TABS.filter((tab) => tab.primary).map((tab) => tab.href)).toEqual(["/compose"]);
  });

  it("keeps the full name as the tab's accessible name when it is shortened", () => {
    const tabs = read("components/app/mobile-tabs.tsx");
    expect(tabs).toContain("MOBILE_TABS");
    expect(tabs).toMatch(/aria-label=\{tab\.shortLabel \? tab\.label : undefined\}/);
  });

  it("keeps search one tap away in the bar, now that it has no tab", () => {
    const header = read("components/app/app-header.tsx");
    expect(header).toMatch(/md:hidden[\s\S]{0,120}href="\/search"/);
  });
});

describe("which destination is lit", () => {
  const kitchen = MEMBER_NAV_LINKS.find((link) => link.href === "/kitchen-table")!;
  const connect = MEMBER_NAV_LINKS.find((link) => link.href === "/connect")!;

  it("matches the page and everything under it", () => {
    expect(isNavActive("/kitchen-table", kitchen)).toBe(true);
    expect(isNavActive("/kitchen-table/anything", kitchen)).toBe(true);
    expect(isNavActive("/messages", kitchen)).toBe(false);
  });

  it("does not match a longer name that merely starts the same", () => {
    expect(isNavActive("/kitchen-tables", kitchen)).toBe(false);
    expect(isNavActive("/learning", { href: "/learn" })).toBe(false);
  });

  it("stays lit on the pages that belong to it", () => {
    expect(isNavActive("/posts/abc123", kitchen)).toBe(true);
    expect(isNavActive("/crews/gluten-free-gang", connect)).toBe(true);
  });
});

describe("the search palette", () => {
  it("offers every menu destination and the account pages", () => {
    const hrefs = MEMBER_DESTINATIONS.map((row) => row.href);
    for (const link of MEMBER_NAV_LINKS) expect(hrefs).toContain(link.href);
    for (const href of ["/notifications", "/drafts", "/settings", "/billing"]) {
      expect(hrefs).toContain(href);
    }
  });

  it("drops the library's retired sections and keeps the catalog rows", () => {
    const catalog = { label: "Winter soups", href: "/learn/winter-soups", group: "Classes" };
    const rows = withMemberDestinations([catalog, ...NAV_SECTION_SUGGESTIONS]);
    expect(rows[0]).toEqual(catalog);
    const labels = rows.map((row) => row.label);
    for (const retired of ["Explorer", "Spaces", "Events", "Live cook-alongs"]) {
      expect(labels, retired).not.toContain(retired);
    }
    expect(rows.map((row) => row.href)).not.toContain("/home");
    expect(rows.map((row) => row.href)).not.toContain("/calendar");
    expect(labels).toContain("Kitchen Table");
    expect(labels).toContain("Ideas & Requests");
  });

  it("finds a renamed page by its old name", () => {
    const find = (query: string) =>
      filterSuggestions(MEMBER_DESTINATIONS, query).map((row) => row.label);
    expect(find("explorer")).toEqual(["Kitchen Table"]);
    expect(find("events")).toContain("Live Classes");
    expect(find("courses")).toContain("Classes");
    expect(find("vote")).toContain("Ideas & Requests");
  });

  it("is what the bar's search field is given", () => {
    expect(read("components/layout/nav-search.tsx")).toContain("withMemberDestinations(");
    expect(read("components/layout/command-palette.tsx")).toContain(
      "suggestions = MEMBER_DESTINATIONS",
    );
  });
});

describe("the console menu", () => {
  const byHref = new Map(ADMIN_NAV_ITEMS.map((item) => [item.href, item.label]));

  it("calls events Live classes, at the same address", () => {
    expect(byHref.get("/admin/events")).toBe("Live classes");
    expect([...byHref.values()]).not.toContain("Events");
  });

  it("adds Ideas, Class categories and Crews", () => {
    expect(byHref.get("/admin/ideas")).toBe("Ideas");
    expect(byHref.get("/admin/courses/categories")).toBe("Class categories");
    expect(byHref.get("/admin/crews")).toBe("Crews");
  });

  it("keeps every section it had", () => {
    for (const href of [
      "/admin",
      "/admin/members",
      "/admin/moderation",
      "/admin/spaces",
      "/admin/bulletin",
      "/admin/variations",
      "/admin/courses",
      "/admin/roadmap",
      "/admin/challenges",
      "/admin/billing",
      "/admin/billing/reconciliation",
      "/admin/billing/webhooks",
      "/admin/welcome",
      "/admin/automation",
      "/admin/cohost",
    ]) {
      expect(byHref.has(href), href).toBe(true);
    }
    expect(ADMIN_NAV.find((group) => group.label === "Community")?.items.length).toBe(8);
  });

  it("lights Class categories, not Courses, on the categories page", () => {
    expect(activeAdminHref("/admin/courses/categories")).toBe("/admin/courses/categories");
    expect(activeAdminHref("/admin/courses/winter-soups")).toBe("/admin/courses");
    expect(activeAdminHref("/admin/crews/gluten-free-gang")).toBe("/admin/crews");
  });
});
