import "server-only";
import { prisma } from "@/lib/db";
import { readZoomConfig, readZoomWebhookSecret } from "@/lib/zoom/config";

/**
 * What the admin's Live classes page says about Zoom: whether it is set up,
 * whether the webhook is, and what the last run did. Never a credential, and
 * never which user ids are configured beyond how many.
 */

export type ZoomRunSummary = {
  id: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  scanned: number;
  created: number;
  updated: number;
  canceled: number;
  error: string | null;
};

export type ZoomStatus = {
  configured: boolean;
  webhookConfigured: boolean;
  /** How many Zoom users the sync reads. */
  userCount: number;
  lastRun: ZoomRunSummary | null;
  /** The last run that finished without an error. */
  lastSuccessAt: Date | null;
  /** Upcoming classes that came from Zoom. */
  upcomingFromZoom: number;
};

const RUN_SELECT = {
  id: true,
  trigger: true,
  startedAt: true,
  finishedAt: true,
  scanned: true,
  created: true,
  updated: true,
  canceled: true,
  error: true,
} as const;

export async function getZoomStatus(now = new Date()): Promise<ZoomStatus> {
  const config = readZoomConfig();
  const [lastRun, lastSuccess, upcomingFromZoom] = await Promise.all([
    prisma.zoomSyncRun
      .findFirst({ orderBy: { startedAt: "desc" }, select: RUN_SELECT })
      .catch(() => null),
    prisma.zoomSyncRun
      .findFirst({
        where: { error: null, finishedAt: { not: null } },
        orderBy: { startedAt: "desc" },
        select: { finishedAt: true },
      })
      .catch(() => null),
    prisma.event
      .count({ where: { source: "ZOOM", status: "PUBLISHED", startsAt: { gte: now } } })
      .catch(() => 0),
  ]);

  return {
    configured: config !== null,
    webhookConfigured: readZoomWebhookSecret() !== null,
    userCount: config?.userIds.length ?? 0,
    lastRun,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    upcomingFromZoom,
  };
}
