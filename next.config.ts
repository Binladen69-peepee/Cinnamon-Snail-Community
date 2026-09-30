import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const posthogHost = (
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
).replace(/\/$/, "");
// The static-assets host is the ingest host with `-assets` on the region.
const posthogAssets = posthogHost.replace(".i.posthog.com", "-assets.i.posthog.com");

const nextConfig: NextConfig = {
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
