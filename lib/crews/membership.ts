import "server-only";
import { prisma } from "@/lib/db";

/**
 * What a member does to crews themselves: join or leave an opt-in crew, and
 * open a crew's group chat (DEC-078).
 *
 * Automatic crews are the recompute job's business. A member cannot leave one
 * (the rule would only put them back) — they can leave its chat instead, and
 * that choice is respected by the job.
 */

export type CrewErrorCode =
  | "not-found"
  | "not-member"
  | "archived"
  | "not-optional"
  | "automatic"
  | "inactive";

export class CrewError extends Error {
  constructor(readonly code: CrewErrorCode) {
    super(code);
    this.name = "CrewError";
  }
}

async function activeMember(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (user?.status !== "ACTIVE") throw new CrewError("inactive");
}

export async function joinOptionalCrew(userId: string, slug: string): Promise<void> {
  const crew = await prisma.crew.findUnique({
    where: { slug },
    select: { id: true, kind: true, archivedAt: true, conversationId: true },
  });
  if (!crew) throw new CrewError("not-found");
  if (crew.archivedAt) throw new CrewError("archived");
  // The rule crews are filled by the job; joining one by hand would be a
  // second way in that the next recompute could not account for.
  if (crew.kind !== "OPTIONAL") throw new CrewError("not-optional");
  await activeMember(userId);

  await prisma.crewMember.upsert({
    where: { crewId_userId: { crewId: crew.id, userId } },
    create: { crewId: crew.id, userId, source: "OPT_IN" },
    update: {},
  });
  if (crew.conversationId) {
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: crew.conversationId, userId } },
      create: { conversationId: crew.conversationId, userId },
      update: { leftAt: null },
    });
  }
}

export async function leaveOptionalCrew(userId: string, slug: string): Promise<void> {
  const crew = await prisma.crew.findUnique({
    where: { slug },
    select: { id: true, conversationId: true },
  });
  if (!crew) throw new CrewError("not-found");
  const row = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId: crew.id, userId } },
    select: { id: true, source: true },
  });
  if (!row) return;
  if (row.source !== "OPT_IN") throw new CrewError("automatic");

  await prisma.crewMember.deleteMany({ where: { id: row.id, source: "OPT_IN" } });
  if (crew.conversationId) {
    await prisma.conversationMember.updateMany({
      where: { conversationId: crew.conversationId, userId, leftAt: null },
      data: { leftAt: new Date(), typingAt: null },
    });
  }
}

/**
 * The crew's group chat, for one of its members: created the first time
 * anybody opens it, with every member of the crew in it, and stored on the
 * crew. Opening it is also how a member who left the chat comes back.
 *
 * An archived crew's chat stays readable by the people still in it, and takes
 * nobody new.
 */
export async function openCrewChat(userId: string, slug: string): Promise<string> {
  const crew = await prisma.crew.findUnique({
    where: { slug },
    select: { id: true, name: true, archivedAt: true, conversationId: true },
  });
  if (!crew) throw new CrewError("not-found");
  await activeMember(userId);

  if (crew.archivedAt) {
    if (crew.conversationId) {
      const seat = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: crew.conversationId, userId } },
        select: { leftAt: true },
      });
      if (seat && !seat.leftAt) return crew.conversationId;
    }
    throw new CrewError("archived");
  }

  const member = await prisma.crewMember.findUnique({
    where: { crewId_userId: { crewId: crew.id, userId } },
    select: { id: true },
  });
  if (!member) throw new CrewError("not-member");

  const conversationId = crew.conversationId ?? (await createCrewChat(crew));
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    create: { conversationId, userId },
    update: { leftAt: null },
  });
  return conversationId;
}

async function createCrewChat(crew: { id: string; name: string }): Promise<string> {
  const members = await prisma.crewMember.findMany({
    where: { crewId: crew.id },
    select: { userId: true },
  });
  const conversation = await prisma.conversation.create({
    data: {
      isGroup: true,
      title: crew.name,
      // Crew chats are not de-duplicated by member set: the crew is the key.
      memberKey: null,
      members: { create: members.map((row) => ({ userId: row.userId })) },
    },
    select: { id: true },
  });
  // Claimed only if nobody else got there first; `conversationId` is unique,
  // so two members opening a brand-new crew chat at once end up in one.
  const claimed = await prisma.crew.updateMany({
    where: { id: crew.id, conversationId: null },
    data: { conversationId: conversation.id },
  });
  if (claimed.count === 1) return conversation.id;

  await prisma.conversation.delete({ where: { id: conversation.id } }).catch(() => undefined);
  const winner = await prisma.crew.findUniqueOrThrow({
    where: { id: crew.id },
    select: { conversationId: true },
  });
  if (!winner.conversationId) throw new Error("Crew chat could not be created");
  return winner.conversationId;
}
