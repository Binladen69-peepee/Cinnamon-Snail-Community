"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function toggleFollowAction(formData: FormData) {
  const session = await auth();
  if (!session?.user.id) return { ok: false as const, error: "Sign in required." };

  const handle = String(formData.get("handle") ?? "").trim();
  if (!handle) return { ok: false as const, error: "Missing member." };

  const target = await prisma.user.findUnique({
    where: { handle },
    select: { id: true, handle: true },
  });
  if (!target) return { ok: false as const, error: "Member not found." };
  if (target.id === session.user.id) {
    return { ok: false as const, error: "You cannot follow yourself." };
  }

  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: session.user.id,
        followingId: target.id,
      },
    },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
  } else {
    await prisma.follow.create({
      data: { followerId: session.user.id, followingId: target.id },
    });
  }

  revalidatePath(`/members/${target.handle}`);
  revalidatePath(`/members/${session.user.handle}`);
  return { ok: true as const, following: !existing };
}
