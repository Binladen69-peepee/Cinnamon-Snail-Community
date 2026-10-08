import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

/**
 * The purge at the end of an account deletion (BUILD.md §10.6).
 *
 * The deletion email promises that personal data is purged after the grace
 * period. That needs two things: the job has to run (it is a daily Vercel
 * cron), and it has to remove what identifies or locates the person while
 * keeping the account row their posts still point at. Needs the local Docker
 * Postgres.
 */

vi.hoisted(() => {
  // Empty, not deleted: PrismaClient re-reads .env and would restore them.
  process.env.RESEND_API_KEY = "";
  process.env.KIT_API_KEY = "";
});

const { purgeDueDeletions } = await import("@/lib/billing/deletion");

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const DAY = 24 * 60 * 60 * 1000;
const ids: string[] = [];
let reachable = true;

async function account(label: string, status: "ACTIVE" | "PENDING_DELETION", requestedDaysAgo: number | null) {
  const email = `${label}-${stamp}@purge.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Purge ${label}`,
      handle: `purge-${label}-${stamp}`,
      passwordHash: "hash",
      status,
      deletionRequestedAt: requestedDaysAgo === null ? null : new Date(Date.now() - requestedDaysAgo * DAY),
      emails: { create: [{ email, isPrimary: true, verifiedAt: new Date() }, { email: `alt-${email}`, verifiedAt: new Date() }] },
      profile: {
        create: {
          displayName: `Purge ${label}`,
          bio: "I cook on Sundays.",
          city: "Lisbon",
          country: "PT",
          cityLatitude: 38.72,
          cityLongitude: -9.14,
          links: ["https://example.com/me"],
          surveyTraits: { vibe: "weeknight" },
          suckiestThing: "Washing up",
        },
      },
      sessions: { create: { sessionToken: `purge-${label}-${stamp}`, expires: new Date(Date.now() + DAY) } },
      pushSubscriptions: { create: { endpoint: `https://push.test/${label}-${stamp}`, p256dh: "k", auth: "a" } },
    },
  });
  ids.push(user.id);
  return { user, email };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
  }
});

afterAll(async () => {
  if (reachable) {
    await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.userEmail.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

describe("purging deleted accounts", () => {
  it("runs every day", () => {
    const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[];
    expect(crons.some((cron) => cron.path === "/api/jobs/billing?job=purge")).toBe(true);
  });

  it("removes personal data once the grace period is over, and only then", async () => {
    if (!reachable) return;
    const due = await account("due", "PENDING_DELETION", 10);
    const waiting = await account("waiting", "PENDING_DELETION", 2);
    const active = await account("active", "ACTIVE", null);

    const result = await purgeDueDeletions(7);
    expect(result.purged).toBeGreaterThanOrEqual(1);

    const purged = await prisma.user.findUniqueOrThrow({ where: { id: due.user.id }, include: { profile: true } });
    expect(purged.status).toBe("DELETED");
    expect(purged.email).toBe(`deleted+${due.user.id}@invalid.local`);
    expect(purged.name).toBeNull();
    expect(purged.passwordHash).toBeNull();
    expect(purged.profile?.displayName).toBe("Deleted member");
    expect(purged.profile?.bio).toBeNull();
    expect(purged.profile?.city).toBeNull();
    expect(purged.profile?.cityLatitude).toBeNull();
    expect(purged.profile?.links).toBeNull();
    expect(purged.profile?.surveyTraits).toBeNull();
    expect(purged.profile?.directoryVisible).toBe(false);
    expect(await prisma.userEmail.count({ where: { userId: due.user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: due.user.id } })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { userId: due.user.id } })).toBe(0);
    // The address is free again: nobody holds it.
    expect(await prisma.userEmail.findUnique({ where: { email: due.email } })).toBeNull();

    for (const kept of [waiting, active]) {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: kept.user.id }, include: { profile: true } });
      expect(row.email).toBe(kept.email);
      expect(row.profile?.bio).toBe("I cook on Sundays.");
      expect(await prisma.userEmail.count({ where: { userId: kept.user.id } })).toBe(2);
      expect(await prisma.session.count({ where: { userId: kept.user.id } })).toBe(1);
    }
  });
});
