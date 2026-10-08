import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const posthogHost = (
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
).replace(/\/$/, "");
// The static-assets host is the ingest host with `-assets` on the region.
const posthogAssets = posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com");

/**
 * Member addresses that were retired, and where they live now.
 *
 * Explorer and the list of spaces gave way to the Kitchen Table (DEC-078), and
 * Events became Live Classes (DEC-079), so old bookmarks, emails and
 * notification links still land somewhere real. These run before proxy.ts,
 * which then asks a signed-out visitor to sign in to the new address.
 *
 * - Temporary (307), not permanent: a browser caches a 308 for good, and any
 *   of these paths may be wanted for something else later.
 * - The query string comes along by itself, so `/home?view=reels` lands on
 *   `/kitchen-table?view=reels`.
 * - `/spaces/:slug` is one segment only. A space's `/settings` and `/review`
 *   pages are still where staff and hosts manage it, so they do not move.
 */
const retiredRoutes = [
  { source: "/home", destination: "/kitchen-table", permanent: false },
  { source: "/spaces", destination: "/kitchen-table", permanent: false },
  { source: "/spaces/:slug", destination: "/kitchen-table", permanent: false },
  { source: "/calendar", destination: "/live-classes", permanent: false },
  { source: "/calendar/:slug", destination: "/live-classes/:slug", permanent: false },
];

/**
 * Response headers (BUILD.md §23).
 *
 * Everywhere: no MIME sniffing, a referrer that never leaks a path to another
 * site, and no camera, microphone or location (nothing here uses them).
 *
 * Framing is refused everywhere except the public pages: a signed-in page in
 * someone else's frame is how a cancel or delete button gets clicked by
 * trickery. The public pages stay frameable because the client's own site may
 * embed them. No full Content-Security-Policy yet: the Bunny player, PostHog,
 * Sentry and the video embeds each need their sources listed and tested first.
 */
const PUBLIC_PAGES = ["membership", "about", "community", "courses", "events", "faq", "privacy", "terms", "unsubscribe"].join("|");
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
const noFraming = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return retiredRoutes;
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Every path but "/" and the public pages above (and anything under them).
      { source: `/:path((?!(?:${PUBLIC_PAGES})(?:/|$)).+)`, headers: noFraming },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // PostHog through our own origin, so blockers keyed on its hostname do not
  // silently drop events (see `api_host` in instrumentation-client.ts).
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
      { source: "/ingest/array/:path*", destination: `${posthogAssets}/array/:path*` },
      { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
    ];
  },
  // PostHog's API paths end in a slash; Next would otherwise redirect them.
  skipTrailingSlashRedirect: true,
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

/**
 * Sentry's build step. Source maps are uploaded only when a build has
 * `SENTRY_AUTH_TOKEN` — a server/build-only secret, never `NEXT_PUBLIC_` — and
 * are deleted from the output afterwards, so readable source is never served
 * to the public. Without the token (local builds, forks) the build is exactly
 * what it was: nothing uploads and nothing fails.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "cinnamon-snail",
  project: process.env.SENTRY_PROJECT || "javascript-nextjs",
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA,
    create: Boolean(sentryAuthToken),
  },
  telemetry: false,
});
