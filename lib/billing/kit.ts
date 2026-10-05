import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { normalizeInterval, planTags } from "@/lib/billing/kit-tags";

/**
 * Billing → Kit: a product's tag follows the member's access to it.
 *
 * SamCart decides access; the entitlement it produces is what this mirrors.
 * Nothing here is ever read back to decide access (DEC-036).
 *
 * Two rules this file exists to keep:
 *
 * - **Revoking removes one tag, never the person.** Kit's `/unsubscribe`
 *   endpoint unsubscribes an address from *everything*, which turned "your
 *   course access ended" into "you will never hear from us again" and broke
 *   commercial opt-out preservation in the other direction. Revocation now
 *   removes exactly the product's tag.
 * - **A tag may be named or numbered.** Kit's API addresses tags by numeric
 *   id; products are configured with names ("Vegan University Monthly"). A
 *   numeric value is used as is; a name is looked up in Kit, and created there
 *   if it does not exist yet, so a purchase is never left untagged because a
 *   tag was named.
 *
 * Every attempt is written to `KitSyncLog`. Failures are retried by the
 * billing retry job (`retryFailedKitSyncs`), which re-derives the desired
 * state from entitlements rather than replaying the old request.
 */

const KIT_BASE = () => (process.env.KIT_API_BASE ?? "https://api.convertkit.com/v3").replace(/\/$/, "");

export type KitSyncResult = {
  success: boolean;
  error?: string;
  skipped?: boolean;
};

/** Failures that will never succeed on retry, so the retry job leaves them. */
const PERMANENT_PREFIXES = ["Product has no Kit tag mapped", "KIT_API_KEY or KIT_API_SECRET"];

class KitHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function kitFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${KIT_BASE()}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new KitHttpError(`Kit HTTP ${response.status}: ${text.slice(0, 300)}`, response.status);
  }
  return (await response.json().catch(() => ({}))) as T;
}

/** Tag name → id, cached for the life of the process. */
const tagIds = new Map<string, string>();

export async function resolveKitTagId(
  tag: string,
  creds: { apiKey: string; apiSecret: string },
): Promise<string> {
  const trimmed = tag.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const cached = tagIds.get(trimmed.toLowerCase());
  if (cached) return cached;

  const list = await kitFetch<{ tags?: { id: number; name: string }[] }>("GET", "/tags", undefined, {
    api_key: creds.apiKey,
  });
  for (const row of list.tags ?? []) tagIds.set(row.name.toLowerCase(), String(row.id));
  const found = tagIds.get(trimmed.toLowerCase());
  if (found) return found;

  const created = await kitFetch<{ id?: number } | { id?: number }[]>("POST", "/tags", {
    api_secret: creds.apiSecret,
    tag: { name: trimmed },
  });
  const id = Array.isArray(created) ? created[0]?.id : created.id;
  if (!id) throw new Error(`Kit did not return an id for new tag "${trimmed}"`);
  tagIds.set(trimmed.toLowerCase(), String(id));
  return String(id);
}

export function clearKitTagCache() {
  tagIds.clear();
}

export async function syncKitForEntitlementChange(input: {
  userId: string;
  email: string;
  tag: string | null | undefined;
  action: "grant" | "revoke";
}): Promise<KitSyncResult> {
  const payload = {
    email: input.email,
    tag: input.tag ?? null,
    action: input.action,
  };
  const action = `kit.${input.action}`;

  if (!input.tag) {
    return writeKitLog(input.userId, action, payload, false, "Product has no Kit tag mapped");
  }

  const apiKey = process.env.KIT_API_KEY;
  const apiSecret = process.env.KIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return writeKitLog(input.userId, action, payload, false, "KIT_API_KEY or KIT_API_SECRET is not configured");
  }

  try {
    const tagId = await resolveKitTagId(input.tag, { apiKey, apiSecret });
    if (input.action === "grant") {
      await kitFetch("POST", `/tags/${encodeURIComponent(tagId)}/subscribe`, {
        api_key: apiKey,
        api_secret: apiSecret,
        email: input.email,
      });
    } else {
      try {
        // Removes this one tag. Never `/unsubscribe`, which would take the
        // address off every list.
        await kitFetch("POST", `/tags/${encodeURIComponent(tagId)}/unsubscribe`, {
          api_secret: apiSecret,
          email: input.email,
        });
      } catch (error) {
        // Not tagged, or not a subscriber at all: the tag is already absent.
        if (!(error instanceof KitHttpError && error.status === 404)) throw error;
      }
    }
    await writeAuditLog({
      actorId: input.userId,
      action,
      targetType: "user",
      targetId: input.userId,
      metadata: { tag: input.tag, tagId },
    });
    return writeKitLog(input.userId, action, { ...payload, tagId }, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kit request failed";
    console.error("[kit] billing sync failed", { userId: input.userId, action, error: message });
    return writeKitLog(input.userId, action, payload, false, message);
  }
}

/**
 * Re-sends billing Kit syncs whose latest attempt failed, from current state.
 *
 * For each member and product tag whose most recent billing Kit attempt in
 * the last week failed (for a reason a retry can fix), the desired state is
 * taken from the member's entitlements *now* — tagged if they have active
 * access to a product carrying that tag, untagged otherwise — and sent once.
 * Grant and remove are both idempotent in Kit, so a retry that races a fresh
 * webhook cannot leave the wrong state behind.
 */
export async function retryFailedKitSyncs(input: { now?: Date; limit?: number } = {}) {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const logs = await prisma.kitSyncLog.findMany({
    where: { action: { in: ["kit.grant", "kit.revoke"] }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, success: true, error: true, payload: true },
  });

  const latest = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    const tag = (log.payload as { tag?: unknown } | null)?.tag;
    if (typeof tag !== "string") continue;
    const key = `${log.userId}\u0000${tag}`;
    if (!latest.has(key)) latest.set(key, log);
  }

  const due = [...latest.entries()]
    .filter(([, log]) => !log.success && !PERMANENT_PREFIXES.some((p) => log.error?.startsWith(p)))
    .slice(0, input.limit ?? 50);

  let retried = 0;
  let succeeded = 0;
  for (const [key] of due) {
    const [userId, tag] = key.split("\u0000") as [string, string];
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) continue;
    const held = await tagsMemberShouldHold(userId, now);
    const result = await syncKitForEntitlementChange({
      userId,
      email: user.email,
      tag,
      action: held.has(tag) ? "grant" : "revoke",
    });
    retried += 1;
    if (result.success) succeeded += 1;
  }
  return { retried, succeeded };
}

/**
 * Every Kit tag a member's current access entitles them to.
 *
 * Derived rather than remembered, which is what makes a retry safe: it asks
 * what is true now instead of replaying a request that may since have been
 * overtaken. It reads the interval from each entitlement's own subscription,
 * so a monthly member is owed the monthly tag and an annual one the annual
 * tag — matching exactly what `planTags` would have applied at the time.
 */
export async function tagsMemberShouldHold(userId: string, now = new Date()): Promise<Set<string>> {
  const entitlements = await prisma.entitlement.findMany({
    where: {
      userId,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: {
      product: { select: { kitTag: true, kitTagMonthly: true, kitTagAnnual: true } },
      subscription: { select: { interval: true } },
    },
  });

  const held = new Set<string>();
  for (const entitlement of entitlements) {
    const plan = planTags({
      product: entitlement.product,
      interval: normalizeInterval(entitlement.subscription?.interval),
      action: "grant",
    });
    for (const tag of plan.add) held.add(tag);
  }
  return held;
}

async function writeKitLog(
  userId: string,
  action: string,
  payload: object,
  success: boolean,
  error?: string,
): Promise<KitSyncResult> {
  await prisma.kitSyncLog.create({
    data: { userId, action, payload, success, error },
  });
  return { success, error };
}

/**
 * Apply several tag changes for one member in one go.
 *
 * Used by the entitlement path, where a change can mean "add the annual tag
 * and remove the monthly one" — a plan switch. Each call is the same
 * idempotent add/remove as a single sync, so repeating the whole plan is
 * harmless, and each is logged separately so the trail shows what moved.
 */
export async function syncKitTags(input: {
  userId: string;
  email: string;
  add: string[];
  remove: string[];
}): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  // Removals first: on a plan switch this leaves no window where a member
  // holds both tags and could be caught by a sequence meant for the other.
  for (const tag of input.remove) {
    const result = await syncKitForEntitlementChange({
      userId: input.userId,
      email: input.email,
      tag,
      action: "revoke",
    });
    if (result.success) applied += 1;
    else failed += 1;
  }
  for (const tag of input.add) {
    const result = await syncKitForEntitlementChange({
      userId: input.userId,
      email: input.email,
      tag,
      action: "grant",
    });
    if (result.success) applied += 1;
    else failed += 1;
  }
  return { applied, failed };
}
