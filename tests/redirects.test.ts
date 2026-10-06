import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import { proxy } from "@/proxy";

/**
 * Retired member addresses and where they go now.
 *
 * Evaluated with Next's own matcher and destination builder, the same two
 * functions its router runs on a redirect, so a pattern that reads right but
 * matches wrong (a nested path, a dropped query) fails here rather than in a
 * member's old bookmark.
 */

// The Sentry wrapper only adds build steps; the routing table is the plain
// config underneath it.
vi.mock("@sentry/nextjs/config", () => ({
  withSentryConfig: (config: unknown) => config,
}));

type Redirect = { source: string; destination: string; permanent?: boolean };

async function loadRedirects(): Promise<Redirect[]> {
  const { default: config } = await import("@/next.config");
  const redirects = (config as { redirects?: () => Promise<Redirect[]> }).redirects;
  expect(redirects, "next.config has no redirects()").toBeTypeOf("function");
  return redirects!();
}

/** Where a request ends up after one pass through the redirect table. */
function follow(redirects: Redirect[], url: string): string | null {
  const parsed = new URL(url, "http://localhost");
  const query = Object.fromEntries(parsed.searchParams);
  for (const rule of redirects) {
    const params = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(
      parsed.pathname,
    );
    if (!params) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: rule.destination,
      params,
      query,
    });
    const search = new URLSearchParams(
      parsedDestination.query as Record<string, string>,
    ).toString();
    return `${parsedDestination.pathname}${search ? `?${search}` : ""}`;
  }
  return null;
}

describe("retired member addresses", () => {
  it("send Explorer to the Kitchen Table, keeping the view", async () => {
    const redirects = await loadRedirects();
    expect(follow(redirects, "/home")).toBe("/kitchen-table");
    expect(follow(redirects, "/home?view=reels")).toBe("/kitchen-table?view=reels");
    expect(follow(redirects, "/home?view=reels&sort=new")).toBe(
      "/kitchen-table?view=reels&sort=new",
    );
  });

  it("send the space list and every space to the Kitchen Table", async () => {
    const redirects = await loadRedirects();
    expect(follow(redirects, "/spaces")).toBe("/kitchen-table");
    expect(follow(redirects, "/spaces/general")).toBe("/kitchen-table");
    expect(follow(redirects, "/spaces/general?tab=about")).toBe("/kitchen-table?tab=about");
  });

  it("leave a space's settings and review pages where they are", async () => {
    const redirects = await loadRedirects();
    expect(follow(redirects, "/spaces/general/settings")).toBeNull();
    expect(follow(redirects, "/spaces/general/review")).toBeNull();
  });

  it("send the calendar and each event to Live Classes", async () => {
    const redirects = await loadRedirects();
    expect(follow(redirects, "/calendar")).toBe("/live-classes");
    expect(follow(redirects, "/calendar/winter-soups")).toBe("/live-classes/winter-soups");
    expect(follow(redirects, "/calendar/winter-soups?ref=email")).toBe(
      "/live-classes/winter-soups?ref=email",
    );
  });

  it("leave the new addresses alone, so nothing loops", async () => {
    const redirects = await loadRedirects();
    for (const path of ["/kitchen-table", "/live-classes", "/live-classes/x", "/ideas", "/"]) {
      expect(follow(redirects, path), path).toBeNull();
    }
  });

  it("are temporary, so a browser never caches them for good", async () => {
    const redirects = await loadRedirects();
    expect(redirects).toHaveLength(5);
    for (const rule of redirects) expect(rule.permanent, rule.source).toBe(false);
  });
});

describe("the edge guard", () => {
  const source = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");
  const prefixes = source.match(/const memberPrefixes = \[([\s\S]*?)\]/)?.[1] ?? "";

  it("guards the new member areas", () => {
    for (const route of ["/kitchen-table", "/ideas", "/live-classes", "/crews", "/challenges"]) {
      expect(prefixes, route).toContain(`"${route}"`);
    }
  });

  it("asks a signed-out visitor to sign in, and brings the query back after", () => {
    const response = proxy(new NextRequest("http://localhost:3000/kitchen-table?view=reels"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/kitchen-table?view=reels");
  });

  it("lets a member with a session through", () => {
    const request = new NextRequest("http://localhost:3000/kitchen-table", {
      headers: { cookie: "authjs.session-token=anything" },
    });
    const response = proxy(request);
    expect(response.headers.get("location")).toBeNull();
  });

  it("leaves the account pages open", () => {
    for (const path of ["/register", "/login", "/forgot-password"]) {
      const response = proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.headers.get("location"), path).toBeNull();
    }
  });
});
