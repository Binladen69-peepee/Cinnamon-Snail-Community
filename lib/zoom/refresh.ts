import "server-only";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { revalidateLiveClasses } from "@/lib/events/revalidate";
import { readZoomConfig, type ZoomConfig } from "@/lib/zoom/config";
import type { ZoomClient } from "@/lib/zoom/client";
import { runZoomSync, type ZoomSyncResult } from "@/lib/zoom/sync";

/**
 * Live classes stay fresh between scheduled runs (DEC-079).
 *
 * The scheduled sync runs once a day: Vercel's Hobby plan refuses any cron
 * that runs more often, and refuses the whole deploy with it. The webhook
 * covers changes as they happen once it is set up. In between, a member
 * opening Live Classes starts a full sync when the last one began more than an
 * hour ago, so a class added on Zoom this morning is there this afternoon.
 *
 * - **Never in the member's way.** The page calls this after its response; the
 *   member sees what is already stored and the next load sees the update.
 * - **Once an hour, not once a visit.** A database-backed claim lets a single
 *   visit through per hour across every server instance; a burst of members
 *   opening the page at nine o'clock is one Zoom read.
 * - **Only full runs count as fresh.** A webhook run reads one meeting and says
 *   nothing about the rest of the list.
 */

export const ZOOM_REFRESH_AFTER_MS = 60 * 60_000;

/** The run triggers that read every configured user's whole list. */
const FULL_RUN_TRIGGERS = ["cron", "manual", "visit"];

export type ZoomRefreshOptions = {
  now?: Date;
  maxAgeMs?: number;
  /** Defaults to the environment; tests pass a config and a fake client. */
  config?: ZoomConfig | null;
  client?: ZoomClient;
};

/**
 * Run a full sync if the last one is older than `maxAgeMs` and nobody else has
 * claimed this hour's refresh. Null when nothing ran.
 */
export async function refreshZoomIfStale(
  options: ZoomRefreshOptions = {},
): Promise<ZoomSyncResult | null> {
  const config = options.config === undefined ? readZoomConfig() : options.config;
  if (!config) return null;

  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? ZOOM_REFRESH_AFTER_MS;

  const latest = await prisma.zoomSyncRun.findFirst({
    where: { trigger: { in: FULL_RUN_TRIGGERS } },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (latest && now.getTime() - latest.startedAt.getTime() < maxAgeMs) return null;

  const claim = await consumeRateLimit("zoom-sync:visit", 1, maxAgeMs);
  if (!claim.ok) return null;

  const result = await runZoomSync({ trigger: "visit", now, config, client: options.client });
  if (result.changed.length > 0) revalidateLiveClasses(result.changed);
  return result;
}
