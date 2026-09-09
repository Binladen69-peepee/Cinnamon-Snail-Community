import { prisma } from "@/lib/db";
import { applyCanonicalEvent } from "@/lib/billing/apply";
import { normalizeSamcartPayload } from "@/lib/billing/normalize";

const MAX_ATTEMPTS = 8;

export async function ingestSamcartPayload(input: {
  rawBody: string;
  payload: unknown;
}) {
  const canonical = normalizeSamcartPayload(input.payload);
  const existing = await prisma.billingEvent.findUnique({
    where: { providerEventId: canonical.providerEventId },
  });
  if (existing) {
    return { event: existing, duplicate: true as const };
  }
  const event = await prisma.billingEvent.create({
    data: {
      provider: "samcart",
      providerEventId: canonical.providerEventId,
      type: canonical.type,
      payload: JSON.parse(input.rawBody) as object,
    },
  });
  return { event, duplicate: false as const };
}

export async function processBillingEvent(eventId: string) {
  const event = await prisma.billingEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Billing event not found");
  if (event.processedAt) return { skipped: true as const, reason: "already processed" };
  if (event.deadLetteredAt) return { skipped: true as const, reason: "dead-lettered" };

  try {
    const result = await applyCanonicalEvent(
      normalizeSamcartPayload(event.payload),
      event.id,
    );
    await prisma.billingEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        failedAt: null,
        error: null,
        attempts: { increment: 1 },
      },
    });
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    const attempts = event.attempts + 1;
    await prisma.billingEvent.update({
      where: { id: event.id },
      data: {
        failedAt: new Date(),
        error: message,
        attempts,
        deadLetteredAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
      },
    });
    throw error;
  }
}

export async function retryFailedBillingEvents() {
  const failed = await prisma.billingEvent.findMany({
    where: { processedAt: null, deadLetteredAt: null, failedAt: { not: null } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  const results = [];
  for (const event of failed) {
    try {
      results.push(await processBillingEvent(event.id));
    } catch (error) {
      results.push({
        ok: false as const,
        id: event.id,
        error: error instanceof Error ? error.message : "retry failed",
      });
    }
  }
  return results;
}
