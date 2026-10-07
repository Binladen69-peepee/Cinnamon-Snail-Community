const DEFAULT_BASE = process.env.SAMCART_API_BASE ?? "https://api.samcart.com/v1";

export type SamcartCancelResult =
  | { ok: true; confirmedAt: Date; periodEnd: Date | null; raw: unknown }
  | { ok: false; error: string };

/**
 * `scheduled`: renewal is off and the subscription ends at `periodEnd` (null
 * when SamCart did not say when). `ended`: nothing is left running — SamCart
 * had already ended it, or ended it now because no paid period remained.
 */
export type SamcartScheduleResult =
  | { ok: true; outcome: "scheduled" | "ended"; confirmedAt: Date; periodEnd: Date | null }
  | { ok: false; error: string };

export type SamcartSubscriptionSnapshot = {
  id: string;
  status: string;
  customerEmail: string | null;
  productId: string | null;
  periodEnd: Date | null;
  /** When a scheduled cancellation takes effect; null when none is scheduled. */
  cancelScheduledFor: Date | null;
  /** The next renewal charge, which is where the paid period ends. */
  nextRebillAt: Date | null;
  /**
   * When the subscription originally started, as SamCart reports it. This is
   * what places a member in their cohort crew (DEC-078); null when SamCart's
   * response carries no start date.
   */
  startedAt: Date | null;
};

export type SamcartProductSnapshot = {
  id: string;
  name: string | null;
  status?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

export function readSamcartPeriodEnd(raw: unknown): Date | null {
  const scheduled = readSamcartCancelDate(raw);
  if (scheduled) return scheduled;
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const subscription = asRecord(root.subscription);
  const candidates = [
    data.service_end_date,
    data.current_period_end,
    data.period_end,
    data.cancel_at,
    subscription.service_end_date,
    subscription.current_period_end,
    subscription.period_end,
    root.service_end_date,
    root.current_period_end,
    root.period_end,
    root.cancel_at,
  ];
  for (const value of candidates) {
    const date = parseDate(value);
    if (date) return date;
  }
  return null;
}

/**
 * When a scheduled cancellation takes effect, from the subscription's
 * `cancel_schedule` (`{ status: "scheduled", cancel_date }`); null when no
 * cancellation is scheduled.
 */
export function readSamcartCancelDate(raw: unknown): Date | null {
  const root = asRecord(raw);
  for (const source of [asRecord(root.data), asRecord(root.subscription), root]) {
    const schedule = asRecord(source.cancel_schedule);
    const status = asString(schedule.status)?.toLowerCase();
    if (status && status !== "scheduled") continue;
    const date = parseDate(schedule.cancel_date);
    if (date) return date;
  }
  return null;
}

/** The subscription's next renewal charge: the end of the period already paid for. */
export function readSamcartNextRebill(raw: unknown): Date | null {
  const root = asRecord(raw);
  for (const source of [asRecord(root.data), asRecord(root.subscription), root]) {
    const date = parseDate(source.next_rebilling_date);
    if (date) return date;
  }
  return null;
}

/**
 * A subscription's original start, from a SamCart subscription resource (the
 * API's `GET /subscriptions/{id}`, or one row of the list).
 *
 * On the resource itself `created_at` is the subscription's creation, which is
 * when the member started paying — the date the cohort crews want. The more
 * explicit names win when SamCart sends them.
 */
export function readSamcartStartedAt(raw: unknown, now = new Date()): Date | null {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const source = Object.keys(data).length ? data : root;
  return firstPlausibleDate(
    [
      source.start_date,
      source.started_at,
      source.subscription_start_date,
      source.start_at,
      source.created_at,
      source.date_created,
      source.created,
    ],
    now,
  );
}

/**
 * The start a webhook can vouch for (DEC-078).
 *
 * The `subscription` object in a notification describes the subscription, so
 * a start date there is the real one. Failing that, a purchase is the start:
 * the order's own date, else the moment the notification arrived. Anything
 * else — a renewal charge, a cancellation — says nothing about when the
 * member began, so it returns null and the SamCart API backfill fills it in
 * later. Root-level timestamps are never used: on a notification they are the
 * time of the event, which for a renewal is years after the start.
 */
export function samcartStartFromWebhook(
  payload: unknown,
  input: { type: string; receivedAt: Date },
): Date | null {
  const root = asRecord(payload);
  const subscription = asRecord(root.subscription);
  const explicit = firstPlausibleDate(
    [
      subscription.start_date,
      subscription.started_at,
      subscription.subscription_start_date,
      subscription.start_at,
      subscription.created_at,
      subscription.date_created,
    ],
    input.receivedAt,
  );
  if (explicit) return explicit;
  if (input.type !== "purchase") return null;
  const order = asRecord(root.order);
  return (
    firstPlausibleDate([order.created_at, order.order_date, order.date_created], input.receivedAt) ??
    input.receivedAt
  );
}

/** The first value that is a date SamCart could have meant: not in the future, not before 2000. */
function firstPlausibleDate(values: unknown[], now: Date): Date | null {
  const latest = now.getTime() + 24 * 60 * 60 * 1000;
  for (const value of values) {
    const date = parseDate(value);
    if (!date) continue;
    if (date.getTime() > latest || date.getUTCFullYear() < 2000) continue;
    return date;
  }
  return null;
}

export async function cancelSamcartSubscription(
  samcartSubscriptionId: string,
): Promise<SamcartCancelResult> {
  const cancel = await samcartRequest(
    `/subscriptions/${encodeURIComponent(samcartSubscriptionId)}/cancel`,
    { method: "POST", body: {} },
  );
  if (!cancel.ok) {
    return { ok: false, error: cancel.error };
  }
  const fromCancel = readSamcartPeriodEnd(cancel.raw);
  const latest = await getSamcartSubscription(samcartSubscriptionId);
  const periodEnd = latest.ok ? latest.subscription.periodEnd : fromCancel;
  return {
    ok: true,
    confirmedAt: new Date(),
    periodEnd: periodEnd ?? fromCancel,
    raw: cancel.raw,
  };
}

/** SamCart statuses for a subscription with nothing left running. */
const ENDED_STATUSES = new Set(["canceled", "cancelled", "completed", "deleted"]);

/**
 * Stops a subscription renewing without taking away what the member has paid
 * for: SamCart cancels it when the current billing period ends
 * (`scheduleCancel` with `cancel_when: "end"`), and access runs until then.
 *
 * SamCart only schedules an active subscription. Its 409 covers three cases,
 * told apart by reading the subscription back: a cancellation is already
 * scheduled (that date stands), the subscription has already ended (nothing to
 * stop), or it is delinquent or paused — no paid period remains to keep, so it
 * is canceled outright.
 */
export async function scheduleSamcartCancellation(
  samcartSubscriptionId: string,
): Promise<SamcartScheduleResult> {
  const path = `/subscriptions/${encodeURIComponent(samcartSubscriptionId)}`;
  const scheduled = await samcartRequest(`${path}/scheduleCancel`, {
    method: "POST",
    body: { cancel_when: "end" },
  });
  if (scheduled.ok) {
    let periodEnd = readSamcartCancelDate(scheduled.raw) ?? readSamcartNextRebill(scheduled.raw);
    if (!periodEnd) {
      const latest = await getSamcartSubscription(samcartSubscriptionId);
      if (latest.ok) {
        periodEnd = latest.subscription.cancelScheduledFor ?? latest.subscription.nextRebillAt;
      }
    }
    return { ok: true, outcome: "scheduled", confirmedAt: new Date(), periodEnd };
  }
  if (scheduled.status !== 409) return { ok: false, error: scheduled.error };

  const latest = await getSamcartSubscription(samcartSubscriptionId);
  if (!latest.ok) return { ok: false, error: scheduled.error };
  const { subscription } = latest;
  if (subscription.cancelScheduledFor) {
    return {
      ok: true,
      outcome: "scheduled",
      confirmedAt: new Date(),
      periodEnd: subscription.cancelScheduledFor,
    };
  }
  if (ENDED_STATUSES.has(subscription.status.toLowerCase())) {
    return { ok: true, outcome: "ended", confirmedAt: new Date(), periodEnd: null };
  }
  const now = await cancelSamcartSubscription(samcartSubscriptionId);
  if (!now.ok) return now;
  return { ok: true, outcome: "ended", confirmedAt: now.confirmedAt, periodEnd: null };
}

export async function getSamcartSubscription(samcartSubscriptionId: string): Promise<
  | { ok: true; subscription: SamcartSubscriptionSnapshot }
  | { ok: false; error: string; status?: number }
> {
  const result = await samcartRequest(
    `/subscriptions/${encodeURIComponent(samcartSubscriptionId)}`,
  );
  if (!result.ok) return result;
  return { ok: true, subscription: snapshotFromRaw(result.raw, samcartSubscriptionId) };
}

export async function getSamcartProduct(samcartProductId: string): Promise<
  | { ok: true; product: SamcartProductSnapshot }
  | { ok: false; error: string }
> {
  const result = await samcartRequest(`/products/${encodeURIComponent(samcartProductId)}`);
  if (!result.ok) return result;
  const root = asRecord(result.raw);
  const data = asRecord(root.data);
  return {
    ok: true,
    product: {
      id: asString(data.id) ?? asString(root.id) ?? samcartProductId,
      name: asString(data.name) ?? asString(root.name),
      status: asString(data.status) ?? asString(root.status),
    },
  };
}

export async function refundSamcartCharge(chargeId: string): Promise<
  | { ok: true; raw: unknown }
  | { ok: false; error: string }
> {
  const v1 = await samcartRequest(`/refunds/charges/${encodeURIComponent(chargeId)}`, {
    method: "POST",
    body: {},
  });
  if (v1.ok) return { ok: true, raw: v1.raw };
  const v2Base = (process.env.SAMCART_API_BASE ?? DEFAULT_BASE).replace(/\/v1\/?$/, "/v2");
  const v2 = await samcartRequest("/refunds", {
    method: "POST",
    body: { charge_id: chargeId },
    base: v2Base,
  });
  if (!v2.ok) return { ok: false, error: v1.error };
  return { ok: true, raw: v2.raw };
}

export async function listSamcartSubscriptions(): Promise<
  | { ok: true; subscriptions: SamcartSubscriptionSnapshot[] }
  | { ok: false; error: string }
> {
  const result = await samcartRequest("/subscriptions?limit=100");
  if (!result.ok) return result;
  const root = asRecord(result.raw);
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(result.raw) ? result.raw : [];
  return {
    ok: true,
    subscriptions: rows.map((item) => snapshotFromRaw(item)),
  };
}

async function samcartRequest(
  path: string,
  options?: { method?: string; body?: unknown; base?: string },
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string; status?: number }> {
  const key = process.env.SAMCART_API_KEY;
  if (!key) {
    return { ok: false, error: "SAMCART_API_KEY is not configured" };
  }
  const base = (options?.base ?? DEFAULT_BASE).replace(/\/$/, "");
  try {
    const response = await fetch(`${base}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        "sc-api": key,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options?.body != null ? JSON.stringify(options.body) : undefined,
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: `SamCart ${options?.method ?? "GET"} ${path} failed (${response.status})`,
        status: response.status,
      };
    }
    return { ok: true, raw };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "SamCart request failed",
    };
  }
}

function snapshotFromRaw(raw: unknown, fallbackId?: string): SamcartSubscriptionSnapshot {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const source = Object.keys(data).length ? data : root;
  const customer = asRecord(source.customer);
  const product = asRecord(source.product);
  return {
    id: asString(source.id) ?? fallbackId ?? "",
    status: asString(source.status) ?? "unknown",
    customerEmail: asString(customer.email)?.toLowerCase() ?? null,
    productId: asString(product.id) ?? asString(source.product_id),
    periodEnd: readSamcartPeriodEnd(raw),
    cancelScheduledFor: readSamcartCancelDate(raw),
    nextRebillAt: readSamcartNextRebill(raw),
    startedAt: readSamcartStartedAt(raw),
  };
}

/** SamCart's "2021-03-08 00:18:35": UTC, written without a zone. */
const ZONELESS_DATE_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  // Read as UTC wherever this runs; left alone, JavaScript would take the
  // server's own time zone.
  const date = new Date(ZONELESS_DATE_TIME.test(text) ? `${text.replace(" ", "T")}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}
