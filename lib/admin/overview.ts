import "server-only";
import { prisma } from "@/lib/db";

/**
 * What the console's rail needs.
 *
 * This file used to hold `loadOverview()` as well — a second, flatter pass over
 * the same tables the overview page now reads through `lib/admin/analytics.ts`.
 * Two loaders counting the same rows is how two screens start disagreeing about
 * how many reports are open, so the flat one is gone and only the rail's single
 * number is left.
 */

/** The one number the rail shows, kept cheap because every page renders it. */
export async function countOpenReports(): Promise<number> {
  return prisma.report.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } });
}
