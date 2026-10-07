import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaFrame } from "@/components/ui/media-frame";
import { HeroImage } from "@/components/marketing/hero-image";
import { CLASS_LIBRARY } from "@/lib/marketing/class-library";
import { ASSET_SLOTS } from "@/lib/marketing/assets";
import { servableImageUrl } from "@/lib/media/servable-image";
import { GET as wpMedia } from "@/app/api/wp-media/[...path]/route";

/**
 * The client's WordPress host refuses to serve its uploads to any other site
 * (`Cross-Origin-Resource-Policy: same-origin`, behind a Cloudflare
 * challenge), which left every class still blank, and WordPress's image CDN
 * drops a browser's burst of requests. The photos the site uses are mirrored
 * into `public/media/wp`; anything else goes through `/api/wp-media`
 * (DEC-087).
 */
describe("an image address a browser here can load", () => {
  const upload = "https://cinnamonsnail.com/wp-content/uploads/2023/10/IMG_0849.jpg";

  it("serves a mirrored photo from this site, small for tiles and full-size otherwise", () => {
    expect(servableImageUrl(upload)).toBe("/media/wp/2023/10/IMG_0849.webp");
    expect(servableImageUrl(upload, 1600)).toBe("/media/wp/2023/10/IMG_0849.webp");
    expect(servableImageUrl(upload, 800)).toBe("/media/wp/2023/10/IMG_0849-800.webp");
    expect(servableImageUrl(upload, 120)).toBe("/media/wp/2023/10/IMG_0849-800.webp");
  });

  it("accepts the host's other spellings and drops the original's query", () => {
    for (const variant of [
      "http://cinnamonsnail.com/wp-content/uploads/2023/10/IMG_0849.jpg",
      "https://www.cinnamonsnail.com/wp-content/uploads/2023/10/IMG_0849.jpg",
      "https://cinnamonsnail.com/wp-content/uploads/2023/10/IMG_0849.jpg?resize=300%2C200",
    ]) {
      expect(servableImageUrl(variant)).toBe(servableImageUrl(upload));
    }
  });

  it("sends an upload that is not mirrored through this site's own route", () => {
    const other = "https://cinnamonsnail.com/wp-content/uploads/2019/01/not-mirrored.jpg";
    expect(servableImageUrl(other)).toBe("/api/wp-media/2019/01/not-mirrored.jpg?w=1200");
    expect(servableImageUrl(other, 700)).toBe("/api/wp-media/2019/01/not-mirrored.jpg?w=800");
    expect(servableImageUrl(other, 5000)).toBe("/api/wp-media/2019/01/not-mirrored.jpg?w=2000");
  });

  it("leaves every other address alone", () => {
    for (const other of [
      "https://hbhvldprkiniibgfpbns.supabase.co/storage/v1/object/public/media/a.jpg",
      "https://i.ytimg.com/vi/GuhyvG7W48c/hqdefault.jpg",
      "/uploads/local.png",
      "blob:http://localhost:3000/abc",
      "https://cinnamonsnail.com/recipes/some-page",
    ]) {
      expect(servableImageUrl(other)).toBe(other);
    }
    expect(servableImageUrl(null)).toBeNull();
    expect(servableImageUrl("")).toBeNull();
  });

  it("has a copy, in both sizes, of every class still and every photo on the sales pages", () => {
    const sources = [
      ...CLASS_LIBRARY.map((cls) => cls.thumbnailUrl),
      ...ASSET_SLOTS.filter((slot) => slot.kind === "image" && slot.src).map((slot) => slot.src!),
    ].filter((src) => src.includes("cinnamonsnail.com/wp-content/uploads"));
    expect(sources.length).toBeGreaterThan(50);
    for (const src of sources) {
      for (const width of [800, 1200]) {
        const local = servableImageUrl(src, width);
        expect(local, src).toMatch(/^\/media\/wp\//);
        expect(existsSync(join(process.cwd(), "public", local)), local).toBe(true);
      }
    }
  });

  it("is what a framed photo actually renders", () => {
    const html = renderToStaticMarkup(createElement(MediaFrame, { src: upload, alt: "" }));
    expect(html).toContain('src="/media/wp/2023/10/IMG_0849.webp"');
    expect(html).not.toContain('src="https://cinnamonsnail.com');
  });

  it("paints the hero photo above the black plate behind it", () => {
    // The plate is positioned; an unpositioned photo paints beneath it, which
    // with reduced motion (no transform animation to lift it) left the hero
    // black.
    const html = renderToStaticMarkup(
      createElement(HeroImage, { src: "https://cinnamonsnail.com/wp-content/uploads/2025/02/matcha-donuts-11.jpg" }),
    );
    const img = html.match(/<img[^>]*>/)?.[0] ?? "";
    expect(img).toContain('src="/media/wp/2025/02/matcha-donuts-11.webp"');
    expect(img).toMatch(/class="vu-hero-photo absolute inset-0/);
    expect(html.indexOf("bg-black")).toBeLessThan(html.indexOf("<img"));
  });
});

describe("the route for photos that are not mirrored", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const call = (path: string[], query = "") =>
    wpMedia(new Request(`http://localhost/api/wp-media/${path.join("/")}${query}`), {
      params: Promise.resolve({ path }),
    });

  it("fetches only image files under the uploads folder", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const path of [
      ["..", "..", "etc", "passwd"],
      ["2023", "10", "page.html"],
      ["2023", "10", "a b.jpg"],
      ["2023", "10", "..", "x.jpg"],
    ]) {
      expect((await call(path)).status, path.join("/")).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the photo with long cache headers, at a width it allows", async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await call(["2019", "01", "cover.jpg"], "?w=650");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("s-maxage=31536000");
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://i0.wp.com/cinnamonsnail.com/wp-content/uploads/2019/01/cover.jpg?w=800&quality=80&strip=info",
    );
  });

  it("retries a refusal and never caches a failure", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>busy</html>", { status: 503, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetch);
    const ok = await call(["2019", "01", "cover.jpg"]);
    expect(ok.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const missing = await call(["2019", "01", "missing.jpg"]);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });
});
