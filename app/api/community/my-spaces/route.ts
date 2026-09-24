import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import { canPostInSpace } from "@/lib/permissions";

/**
 * The spaces this member may post into.
 *
 * Fetched when the share dialog opens rather than shipped with every post
 * card: a feed of twenty cards would otherwise carry twenty identical copies
 * of the same list.
 *
 * The list is filtered by `canPostInSpace`, so a room where only hosts may
 * post never appears as somewhere to share into. The share action checks again
 * regardless — this only avoids offering something that would be refused.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const viewer = await getUserAuth(session.user.id);
  if (!viewer) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }

  const memberships = await prisma.spaceMembership.findMany({
    where: { userId: session.user.id },
    orderBy: { space: { sortOrder: "asc" } },
    take: 100,
    select: {
      role: true,
      space: {
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          postingPermission: true,
          productId: true,
          approvalRequired: true,
          hostUserId: true,
        },
      },
    },
  });

  const spaces = memberships
    .filter((row) => canPostInSpace(viewer, row.space, { role: row.role }))
    .map((row) => ({
      id: row.space.id,
      name: row.space.name,
      slug: row.space.slug,
      needsApproval: row.space.approvalRequired,
    }));

  return NextResponse.json({ spaces });
}
