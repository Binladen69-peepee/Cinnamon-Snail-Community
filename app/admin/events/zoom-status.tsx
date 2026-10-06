import { Video } from "lucide-react";
import type { ZoomStatus } from "@/lib/zoom/status";
import { formatEventTime } from "@/lib/events/timezone";
import { Badge, Callout, Card, CardHeader } from "@/components/app/ui";
import { ZoomSyncButton } from "@/app/admin/events/zoom-sync-button";

const TRIGGER: Record<string, string> = {
  cron: "scheduled run",
  webhook: "Zoom webhook",
  manual: "synced by hand",
  visit: "refreshed when a member opened Live classes",
};

function stamp(date: Date): string {
  return `${formatEventTime(date, "UTC", { year: "numeric" })} UTC`;
}

/**
 * Where live classes come from, at a glance: whether Zoom is connected, what
 * the last sync did, and the button to run one now. Shown on the admin's Live
 * classes page. Says nothing about the credentials beyond whether they exist.
 */
export function ZoomStatusCard({ status }: { status: ZoomStatus }) {
  const last = status.lastRun;
  const failed = Boolean(last?.error) && status.configured;

  return (
    <Card padding="none">
      <CardHeader
        title="Zoom"
        icon={<Video />}
        description={
          status.configured
            ? "Meetings whose topic says LIVE CLASS become live classes here."
            : "Not connected. Live classes are added by hand."
        }
      />

      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {status.configured ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-label text-foreground-muted">
                New and changed meetings arrive on their own. Sync now to see one straight away.
              </p>
              <ZoomSyncButton configured />
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-label sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-caption text-foreground-muted">Connection</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="success">Connected</Badge>
                  <Badge tone={status.webhookConfigured ? "brand" : "neutral"}>
                    {status.webhookConfigured ? "Webhook on" : "Webhook off"}
                  </Badge>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-foreground-muted">Reads</dt>
                <dd className="mt-1 text-foreground">
                  {status.userCount === 1
                    ? "1 Zoom user"
                    : `${status.userCount} Zoom users`}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-foreground-muted">Upcoming from Zoom</dt>
                <dd className="mt-1 tabular-nums text-foreground">
                  {status.upcomingFromZoom}
                </dd>
              </div>
            </dl>

            {last ? (
              <p className="text-label text-foreground-muted">
                Last sync{" "}
                <time dateTime={last.startedAt.toISOString()} className="tabular-nums text-foreground">
                  {stamp(last.startedAt)}
                </time>
                {" · "}
                {TRIGGER[last.trigger] ?? last.trigger}
                {last.finishedAt
                  ? ` · ${last.created} new, ${last.updated} updated, ${last.canceled} canceled`
                  : " · still running"}
                .
              </p>
            ) : (
              <p className="text-label text-foreground-muted">
                Zoom has not been read yet. Run a sync, or wait for the next scheduled one.
              </p>
            )}

            {failed && last?.error ? (
              <Callout tone="danger" title="The last sync had a problem">
                {last.error} Nothing it could not confirm was changed.
                {status.lastSuccessAt
                  ? ` The last clean sync was ${stamp(status.lastSuccessAt)}.`
                  : ""}
              </Callout>
            ) : null}

            {!status.webhookConfigured ? (
              <p className="text-caption text-foreground-muted">
                Changes in Zoom show up at the next scheduled sync. To see them within
                seconds, add the webhook (ZOOM_WEBHOOK_SECRET_TOKEN, pointed at
                /api/webhooks/zoom).
              </p>
            ) : null}
          </>
        ) : (
          <>
            <Callout tone="neutral" title="Zoom is not configured">
              <span id="zoom-not-configured">
                Live classes work exactly as before: schedule them here by hand. To bring
                them in from Zoom automatically, add a Server-to-Server OAuth app&apos;s
                ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET (and, optionally,
                ZOOM_USER_IDS and ZOOM_WEBHOOK_SECRET_TOKEN) to the environment.
              </span>
            </Callout>
            <div>
              <ZoomSyncButton configured={false} />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
