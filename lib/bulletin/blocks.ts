import "server-only";
import { prisma } from "@/lib/db";

/**
 * Everyone the viewer has blocked or been blocked by (BUILD.md §19, "Blocks").
 *
 * Either direction counts: somebody who blocked you, or whom you blocked, does
 * not appear to you anywhere on the board, in the Kitchen Table card for one of
 * their items included.
 */
export async function blockedWith(viewerId: string): Promise<Set<string>> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const out = new Set<string>();
  for (const row of rows) {
    out.add(row.blockerId);
    out.add(row.blockedId);
  }
  out.delete(viewerId);
  return out;
}
