import { NextResponse } from "next/server";
import { PROXY_WIDTHS, proxyWidth } from "@/lib/media/servable-image";

/**
 * A photo from the client's WordPress library that is not in the local mirror
 * (DEC-087): a course cover typed into admin, an older post.
 *
 * cinnamonsnail.com refuses to serve its uploads to other sites, and
 * WordPress's image CDN (`i0.wp.com`) drops a browser's burst of requests, so
 * the browser asks this route instead. It fetches one file server-side from
 * the CDN — fixed host, a checked path, nothing else — retries a refusal,
 * and answers with long cache headers so the CDN in front of the app keeps
 * it. Public, like the sales pages these photos appear on; signed-out
 * visitors see them too.
 */

const CDN = "https://i0.wp.com/cinnamonsnail.com/wp-content/uploads";
/** "2023/10/IMG_0849.jpg": a few plain segments ending in an image file. */
const SAFE_PATH = /^(?:[A-Za-z0-9_.%-]+\/){0,4}[A-Za-z0-9_.%-]+\.(?:jpe?g|png|webp|gif)$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const rel = path.join("/");
  if (!SAFE_PATH.test(rel) || path.some((segment) => segment === "." || segment === "..")) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const requested = Number(new URL(request.url).searchParams.get("w"));
  const width = proxyWidth(Number.isFinite(requested) && requested > 0 ? requested : PROXY_WIDTHS[2]);

  let status = 502;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const upstream = await fetch(`${CDN}/${rel}?w=${width}&quality=80&strip=info`, {
        headers: { Accept: "image/webp,image/*;q=0.8" },
        signal: AbortSignal.timeout(8_000),
      });
      const type = upstream.headers.get("content-type") ?? "";
      if (upstream.ok && type.startsWith("image/")) {
        return new NextResponse(upstream.body, {
          headers: {
            "Content-Type": type,
            // A photo at a path never changes; a year in the CDN, a day in
            // the browser.
            "Cache-Control": "public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (upstream.status === 404) {
        status = 404;
        break;
      }
      status = 502;
    } catch {
      status = 504;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}
