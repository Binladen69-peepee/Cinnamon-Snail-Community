import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getSamcartSubscription } from "@/lib/billing/samcart-api";
import { MEMBERSHIP_PRODUCT_KINDS } from "@/lib/crews/eligibility";

/**
 * Fills `Subscription.startedAt` from the SamCart API for subscriptions whose
 * webhooks never said when they began (DEC-078) — rows written by a renewal,
 * by an import, or before this column existed.
 *
 * The cohort crews read only this column. They never fall back to the row's
 * `createdAt` or an entitlement's `startsAt`, because for an imported member
 * both are the migration date: a member who joined in 2023 and was migrated in
 * October 2026 must land in their 2023 cohort, not "Fall 2026". So a row this
 * cannot date stays undated, and its member has no cohort crew until it can.
 *
 * Only membership subscriptions are asked about (a course purchase does not
 * make anybody a member), at most a batch per run, spaced, and a row SamCart
 * answers without any date is marked so it is asked again in a month rather
 * than every night.
 */

export const SAMCART_START_ACTION = "crews.samcart_start_backfill";
/** `startedAtSource` for a row SamCart was asked about and could not date. */
export const SAMCART_NO_DATE = "samcart_api_missing";

const SPACING_MS = 300;
const RETRY_UNDATED_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export type SubscriptionStartReader = (
  samcartSubscriptionId: string,
) => Promise<{ ok: true; startedAt: Date | null } | { ok: false; error: string; status?: number }>;

const httpReader: SubscriptionStartReader = async (id) => {
  const result = await getSamcartSubscription(id);
  return result.ok ? { ok: true, startedAt: result.subscription.startedAt } : result;
};

export type SamcartStartResult = {
  configured: boolean;
  checked: number;
  filled: number;
  /** SamCart answered but gave no date. */
  undated: number;
  failed: number;
  remaining: number;
  stoppedEarly: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function backfillSamcartStarts(
  options: {
    now?: Date;
    limit?: number;
    budgetMs?: number;
    userIds?: string[];
    reader?: SubscriptionStartReader;
    spacingMs?: number;
    record?: boolean;
    actorId?: string | null;
    trigger?: string;
  } = {},
): Promise<SamcartStartResult> {
  const now = options.now ?? new Date();
  const configured = Boolean(options.reader) || Boolean(process.env.SAMCART_API_KEY);
  const where: Prisma.SubscriptionWhereInput = {
    samcartSubscriptionId: { not: null },
    startedAt: null,
    product: { kind: { in: [...MEMBERSHIP_PRODUCT_KINDS] } },
    OR: [
      { startedAtSource: null },
      {
        startedAtSource: SAMCART_NO_DATE,
        updatedAt: { lt: new Date(now.getTime() - RETRY_UNDATED_AFTER_MS) },
      },
    ],
    ...(options.userIds ? { userId: { in: options.userIds } } : {}),
  };

  const result: SamcartStartResult = {
    configured,
    checked: 0,
    filled: 0,
    undated: 0,
    failed: 0,
    remaining: 0,
    stoppedEarly: null,
  };

  if (!configured) {
    result.remaining = await prisma.subscription.count({ where });
    result.stoppedEarly = "SamCart API is not configured";
    if (options.record !== false) await record(result, options);
    return result;
  }

  const reader = options.reader ?? httpReader;
  const limit = Math.max(1, options.limit ?? 25);
  const deadline = Date.now() + (options.budgetMs ?? 12_000);
  const spacing = options.spacingMs ?? SPACING_MS;

  const rows = await prisma.subscription.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, samcartSubscriptionId: true },
  });

  for (const [index, row] of rows.entries()) {
    if (Date.now() >= deadline) {
      result.stoppedEarly = "time budget used";
      break;
    }
    if (index > 0 && spacing > 0) await sleep(spacing);
    const answer = await reader(row.samcartSubscriptionId!);
    result.checked += 1;
    if (!answer.ok) {
      result.failed += 1;
      // A 404 is about this one subscription; anything else (rate limit, an
      // outage, a bad key) will be the same for the next one.
      if (answer.status !== 404) {
        result.stoppedEarly = answer.status === 429 ? "SamCart rate limit" : "SamCart unavailable";
        break;
      }
      continue;
    }
    if (answer.startedAt) {
      // Conditional on still being undated, so a webhook that dated the row
      // in the meantime is never overwritten.
      const updated = await prisma.subscription.updateMany({
        where: { id: row.id, startedAt: null },
        data: { startedAt: answer.startedAt, startedAtSource: "samcart_api" },
      });
      result.filled += updated.count;
    } else {
      await prisma.subscription.updateMany({
        where: { id: row.id, startedAt: null },
        data: { startedAtSource: SAMCART_NO_DATE },
      });
      result.undated += 1;
    }
  }

  result.remaining = await prisma.subscription.count({ where });
  if (options.record !== false) await record(result, options);
  return result;
}

async function record(
  result: SamcartStartResult,
  options: { actorId?: string | null; trigger?: string },
) {
  await writeAuditLog({
    actorId: options.actorId ?? null,
    action: SAMCART_START_ACTION,
    targetType: "crews",
    metadata: { ...result, trigger: options.trigger ?? "job" } as unknown as Prisma.InputJsonValue,
  }).catch(() => undefined);
}
