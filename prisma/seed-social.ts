import type { PrismaClient } from "@prisma/client";
import { BADGE_RULES } from "../lib/social/badge-rules";
import { conversationMemberKey } from "../lib/messages/permissions";

/**
 * Phase 4 / 4A seed: the badge catalog, member interests that give the matcher
 * something real to work with, and two conversations so Messages is not an
 * empty room on a fresh database.
 */
export async function seedSocial(prisma: PrismaClient) {
  for (const rule of BADGE_RULES) {
    await prisma.badge.upsert({
      where: { slug: rule.slug },
      create: {
        slug: rule.slug,
        name: rule.name,
        description: rule.description,
        icon: rule.icon,
        criteria: rule.criteria,
        sortOrder: rule.sortOrder,
      },
      update: {
        name: rule.name,
        description: rule.description,
        icon: rule.icon,
        criteria: rule.criteria,
        sortOrder: rule.sortOrder,
      },
    });
  }

  // Interests and timezones are what the matcher actually reads.
  const traits: Record<
    string,
    { interests: string[]; skill: string; timezone: string }
  > = {
    adam: {
      interests: ["weeknight dinners", "tofu", "sauces"],
      skill: "confident",
      timezone: "America/Los_Angeles",
    },
    sam: {
      interests: ["soups", "batch cooking", "tofu"],
      skill: "beginner",
      timezone: "America/Los_Angeles",
    },
    jordan: {
      interests: ["tofu", "citrus", "weeknight dinners"],
      skill: "confident",
      timezone: "America/Chicago",
    },
    priya: {
      interests: ["dal", "bread", "sauces"],
      skill: "confident",
      timezone: "America/Chicago",
    },
    lee: {
      interests: ["greens", "steaming", "soups"],
      skill: "beginner",
      timezone: "America/Los_Angeles",
    },
  };

  for (const [handle, trait] of Object.entries(traits)) {
    const user = await prisma.user.findUnique({
      where: { handle },
      select: { id: true },
    });
    if (!user) continue;
    await prisma.profile.updateMany({
      where: { userId: user.id },
      data: {
        cookingInterests: trait.interests,
        skillLevel: trait.skill,
        timezone: trait.timezone,
        matchingOptIn: true,
      },
    });
  }

  const [adam, sam, jordan] = await Promise.all([
    prisma.user.findUnique({ where: { handle: "adam" }, select: { id: true } }),
    prisma.user.findUnique({ where: { handle: "sam" }, select: { id: true } }),
    prisma.user.findUnique({ where: { handle: "jordan" }, select: { id: true } }),
  ]);
  if (!adam || !sam || !jordan) return;

  await seedConversation(
    prisma,
    [adam.id, sam.id],
    null,
    [
      { authorId: sam.id, body: "The tofu pressed for 20 minutes was the whole trick. Thank you." },
      { authorId: adam.id, body: "That is the one thing I would put on a poster. What are you cooking Thursday?" },
      { authorId: sam.id, body: "Soup again. I have accepted this about myself." },
    ],
  );

  await seedConversation(
    prisma,
    [adam.id, sam.id, jordan.id],
    "Thursday cook-along",
    [
      { authorId: adam.id, body: "Anyone up for cooking the same thing Thursday and comparing plates?" },
      { authorId: jordan.id, body: "In. I have three lemons that need a purpose." },
    ],
  );
}

async function seedConversation(
  prisma: PrismaClient,
  memberIds: string[],
  title: string | null,
  messages: { authorId: string; body: string }[],
) {
  const isGroup = memberIds.length > 2;
  // 1:1 threads are keyed by their participants so re-seeding is idempotent.
  const memberKey = isGroup ? null : conversationMemberKey(memberIds);
  const existing = memberKey
    ? await prisma.conversation.findUnique({ where: { memberKey } })
    : await prisma.conversation.findFirst({ where: { title, isGroup: true } });
  if (existing) return existing;

  const conversation = await prisma.conversation.create({
    data: {
      isGroup,
      title,
      memberKey,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });

  let stamp = Date.now() - messages.length * 3_600_000;
  for (const message of messages) {
    stamp += 3_600_000;
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorId: message.authorId,
        body: message.body,
        createdAt: new Date(stamp),
      },
    });
  }
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(stamp) },
  });
  // The author of the last message has by definition read the thread.
  const lastAuthor = messages.at(-1)?.authorId;
  if (lastAuthor) {
    await prisma.conversationMember.updateMany({
      where: { conversationId: conversation.id, userId: lastAuthor },
      data: { lastReadAt: new Date(stamp) },
    });
  }
  return conversation;
}
