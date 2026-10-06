import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  markMatchMessaged,
  resolveMatchDraft,
  startMatchConversation,
} from "@/lib/social/suggestions";
import { matchOpener, weekStart } from "@/lib/social/scoring";
import { conversationMemberKey } from "@/lib/messages/permissions";
import { directMessageTarget } from "@/lib/messages/start";

/**
 * "Message <name>" on the weekly match (DEC-078), against the database.
 *
 * One tap opens the direct thread with the suggested opener waiting in the
 * composer. The properties: it only works for the member the match belongs
 * to; it refuses — without creating a thread — when a block or the other
 * member's message settings would refuse the message; the opener is only
 * ever resolved for the owner, in that one thread; and the match shows as
 * messaged once they actually send.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */
const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let reachable = true;
const made: string[] = [];
const NOW = new Date("2031-05-14T12:00:00Z");

const id: Record<string, string> = {};
const handle: Record<string, string> = {};
const match: Record<string, string> = {};

async function makeMember(suffix: string, dmPreference: "EVERYONE" | "NOBODY" = "EVERYONE") {
  const user = await prisma.user.create({
    data: {
      email: `it-connectdm-${stamp}-${suffix}@example.test`,
      handle: `itcdm${stamp}${suffix}`,
      name: `Pat ${suffix}`,
      status: "ACTIVE",
      profile: { create: { displayName: `Pat ${suffix}`, dmPreference, matchingOptIn: true } },
    },
    select: { id: true, handle: true },
  });
  made.push(user.id);
  id[suffix] = user.id;
  handle[suffix] = user.handle;
  return user.id;
}

async function makeMatch(ownerId: string, matchedId: string) {
  const row = await prisma.memberMatch.create({
    data: {
      weekStart: weekStart(NOW),
      userId: ownerId,
      matchedUserId: matchedId,
      score: 20,
      reason: "You both cook tofu.",
      // Stored the old way, as advice to the viewer.
      starter: "Ask Pat what they last made with tofu.",
    },
    select: { id: true },
  });
  return row.id;
}

async function threadBetween(a: string, b: string) {
  return prisma.conversation.findUnique({ where: { memberKey: conversationMemberKey([a, b]) } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  await makeMember("viewer");
  await makeMember("matched");
  await makeMember("stranger");
  await makeMember("blocker");
  await makeMember("closed", "NOBODY");

  match.open = await makeMatch(id.viewer, id.matched);
  match.blocked = await makeMatch(id.viewer, id.blocker);
  match.closed = await makeMatch(id.viewer, id.closed);
  await prisma.userBlock.create({ data: { blockerId: id.blocker, blockedId: id.viewer } });
});

afterAll(async () => {
  if (reachable) {
    await prisma.conversation.deleteMany({
      where: { members: { some: { userId: { in: made } } } },
    });
    await prisma.user.deleteMany({ where: { id: { in: made } } });
  }
  await prisma.$disconnect();
});

describe("opening a match's direct message", () => {
  let conversationId = "";
  let draftKey = "";

  it("opens the one-to-one thread for the match's owner", async () => {
    if (!reachable) return;
    const result = await startMatchConversation(id.viewer, match.open);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    conversationId = result.conversationId;
    draftKey = result.draftKey;
    expect(draftKey).toBe(`match:${match.open}`);
    expect((await threadBetween(id.viewer, id.matched))?.id).toBe(conversationId);

    // Tapping again reuses the thread rather than making a second one.
    const again = await startMatchConversation(id.viewer, match.open);
    expect(again.ok && again.conversationId).toBe(conversationId);
  });

  it("pre-fills the suggested opener for the owner, and for nobody else", async () => {
    if (!reachable) return;
    const draft = await resolveMatchDraft({ viewerId: id.viewer, draftKey, conversationId });
    expect(draft?.body).toBe(matchOpener("Ask Pat what they last made with tofu.", "Pat matched"));
    expect(draft?.body).toMatch(/^Hi Pat! Connect suggested we meet this week/);

    // The matched member is in the same thread, but it is not their match.
    expect(
      await resolveMatchDraft({ viewerId: id.matched, draftKey, conversationId }),
    ).toBeNull();
    expect(
      await resolveMatchDraft({ viewerId: id.stranger, draftKey, conversationId }),
    ).toBeNull();
    // Not a key at all, or the key on some other thread.
    expect(
      await resolveMatchDraft({ viewerId: id.viewer, draftKey: "hello", conversationId }),
    ).toBeNull();
    expect(
      await resolveMatchDraft({ viewerId: id.viewer, draftKey, conversationId: "not-this-one" }),
    ).toBeNull();
  });

  it("refuses somebody else's match without creating anything", async () => {
    if (!reachable) return;
    const result = await startMatchConversation(id.stranger, match.open);
    expect(result).toEqual({ ok: false, code: "not-found" });
    expect(await threadBetween(id.stranger, id.matched)).toBeNull();
  });

  it("respects a block, and creates no thread", async () => {
    if (!reachable) return;
    const result = await startMatchConversation(id.viewer, match.blocked);
    expect(result.ok).toBe(false);
    expect(await threadBetween(id.viewer, id.blocker)).toBeNull();
  });

  it("respects a member who has turned off direct messages, and says why", async () => {
    if (!reachable) return;
    const result = await startMatchConversation(id.viewer, match.closed);
    expect(result).toEqual({
      ok: false,
      code: "dm-refused",
      reason: "This member has turned off direct messages.",
    });
    expect(await threadBetween(id.viewer, id.closed)).toBeNull();
  });

  it("marks the match messaged when its owner sends, and only then", async () => {
    if (!reachable) return;
    // Somebody else holding the key changes nothing.
    await markMatchMessaged({ viewerId: id.stranger, draftKey, conversationId });
    expect(
      (await prisma.memberMatch.findUniqueOrThrow({ where: { id: match.open } })).status,
    ).toBe("SUGGESTED");

    await markMatchMessaged({ viewerId: id.viewer, draftKey, conversationId });
    const row = await prisma.memberMatch.findUniqueOrThrow({ where: { id: match.open } });
    expect(row.status).toBe("CONNECTED");
    expect(row.respondedAt).not.toBeNull();

    // Sent: an old link with the key no longer refills the composer.
    expect(
      await resolveMatchDraft({ viewerId: id.viewer, draftKey, conversationId }),
    ).toBeNull();
  });
});

describe("profile links to /messages?to=", () => {
  it("land on the existing thread, or on the picker with the member chosen", async () => {
    if (!reachable) return;
    const thread = await threadBetween(id.viewer, id.matched);
    expect(await directMessageTarget(id.viewer, handle.matched)).toBe(`/messages/${thread!.id}`);
    expect(await directMessageTarget(id.viewer, `@${handle.stranger}`)).toBe(
      `/messages/new?to=${handle.stranger}`,
    );
    expect(await directMessageTarget(id.viewer, "../../admin")).toBe("/messages/new");
  });
});
