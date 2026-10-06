import "server-only";

/**
 * Where the Zoom sync gets its credentials (DEC-079).
 *
 * A Server-to-Server OAuth app in the client's Zoom account: three values from
 * the app's credentials page, plus whose meetings to read. All of it is
 * server-side configuration. Nothing here is ever sent to a browser, logged or
 * written to the database, and `readZoomConfig` is the only place that reads
 * the variables, so there is one place to audit.
 *
 * Without the three credentials the whole integration is off: the sync records
 * that Zoom is not configured and changes nothing, and staff add live classes
 * by hand exactly as before.
 */

export type ZoomConfig = {
  accountId: string;
  clientId: string;
  clientSecret: string;
  /**
   * Whose meetings to read: Zoom user ids or emails. `me` is the user who
   * created the app, which is what a one-host school wants.
   */
  userIds: string[];
};

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | null {
  const raw = env[name];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The sync's configuration, or null when Zoom is not set up. */
export function readZoomConfig(env: Env = process.env): ZoomConfig | null {
  const accountId = value(env, "ZOOM_ACCOUNT_ID");
  const clientId = value(env, "ZOOM_CLIENT_ID");
  const clientSecret = value(env, "ZOOM_CLIENT_SECRET");
  if (!accountId || !clientId || !clientSecret) return null;

  const listed = (value(env, "ZOOM_USER_IDS") ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const userIds = [...new Set(listed)];

  return {
    accountId,
    clientId,
    clientSecret,
    userIds: userIds.length > 0 ? userIds.slice(0, 20) : ["me"],
  };
}

/** Whether the scheduled sync can run at all. */
export function zoomConfigured(env: Env = process.env): boolean {
  return readZoomConfig(env) !== null;
}

/** The webhook's secret token, or null when the webhook is not set up. */
export function readZoomWebhookSecret(env: Env = process.env): string | null {
  return value(env, "ZOOM_WEBHOOK_SECRET_TOKEN");
}
