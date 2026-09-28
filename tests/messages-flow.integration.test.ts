import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MessagePermissionError,
  blockMember,
  createGroupConversation,
  findOrCreateDirectConversation,
  loadOlderMessages,
  readConversation,
  sendMessage,
  totalUnreadForUser,
  unblockMember,
} from "@/lib/messages/conversations";
import { MESSAGE_LIMITS, MessageRateLimitError } from "@/lib/messages/rate-limits";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * The messaging write paths, against the database.
 *
 * The properties that only exist once there are rows: that a thread opens on
 * its newest page rather than its oldest, that the unread badge counts what it
 * says it counts, that a double send is one message, that a blocked pair
 * cannot reach each other, and that a guessed conversation id is refused.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */
const prisma = new PrismaClient();

let reachable = true;
const ids: string[] = [];
let alice = "";
let bob = "";
let carol = "";
let stranger = "";
const stamp = Date.now().toString(36);

async function makeUser(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `it-msg-${stamp}-${suffix}@example.test`,
      handle: `itmsg${stamp}${suffix}`,
      name: `Msg ${suffix}`,
      status: "ACTIVE",
      profile: { create: { displayName: `Msg ${suffix}`, dmPreference: "EVERYONE" } },
    },
    select: { id: true },
  });
  ids.push(user.id);
  return user.id;
}

/** The limiter is real and shared; these suites send far more than a person. */
async function clearLimits() {
  await prisma.rateLimitBucket
    .deleteMany({ where: { key: { startsWith: "messages:" } } })
    .catch(() => {});
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  carol = await makeUser("carol");
  stranger = await makeUser("stranger");
});

afterAll(async () => {
  if (reachable) {
    // Conversations, members and messages cascade from the users.
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
    await clearLimits();
  }
  await prisma.$disconnect().catch(() => {});
});

beforeEach(async () => {
  if (!reachable) return;
  await clearLimits();
});

async function freshThread() {
  const conversation = await findOrCreateDirectConversation(alice, bob);
  await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
  await prisma.conversationMember.updateMany({
    where: { conversationId: conversation.id },
    data: { lastReadAt: null },
  });
  return conversation.id;
}

describe("1:1 threads", () => {
  it("reuses one row however many times it is opened", async () => {
    if (!reachable) return;
    const first = await findOrCreateDirectConversation(alice, bob);
    await clearLimits();
    const second = await findOrCreateDirectConversation(bob, alice);
    expect(second.id).toBe(first.id);
  });

  it("sends and stores a message", async () => {
    if (!reachable) return;
    const id = await freshThread();
    const message = await sendMessage({
      conversationId: id,
      authorId: alice,
      body: "Hello",
    });
    expect(message.body).toBe("Hello");

    const thread = await readConversation(id, bob);
    expect(thread?.messages.map((m) => m.body)).toEqual(["Hello"]);
  });

  it("bumps the thread's ordering in the same transaction as the message", async () => {
    if (!reachable) return;
    const id = await freshThread();
    const message = await sendMessage({
      conversationId: id,
      authorId: alice,
      body: "Ordering",
    });
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id },
      select: { lastMessageAt: true },
    });
    // These were three statements with the insert outside the transaction, so
    // a failure between them left the inbox sorting on a stale timestamp.
    expect(conversation.lastMessageAt?.toISOString()).toBe(
      message.createdAt.toISOString(),
    );
  });

  it("refuses an empty message", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await expect(
      sendMessage({ conversationId: id, authorId: alice, body: "   " }),
    ).rejects.toBeInstanceOf(MessagePermissionError);
  });
});

describe("idempotency", () => {
  it("treats the same clientId as one message, not two", async () => {
    if (!reachable) return;
    const id = await freshThread();
    const clientId = `key-${stamp}`;
    const first = await sendMessage({
      conversationId: id,
      authorId: alice,
      body: "Only once",
      clientId,
    });
    const again = await sendMessage({
      conversationId: id,
      authorId: alice,
      body: "Only once",
      clientId,
    });
    expect(again.id).toBe(first.id);
    expect(
      await prisma.message.count({ where: { conversationId: id } }),
    ).toBe(1);
  });

  it("survives the same key sent concurrently", async () => {
    if (!reachable) return;
    // A retry that races the original, which is what a flaky connection does.
    const id = await freshThread();
    const clientId = `race-${stamp}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        sendMessage({
          conversationId: id,
          authorId: alice,
          body: "Racing",
          clientId,
        }).catch(() => null),
      ),
    );
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(1);
    const ok = results.filter(Boolean);
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((row) => row!.id)).size).toBe(1);
  });

  it("still allows two genuinely different messages", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await sendMessage({ conversationId: id, authorId: alice, body: "One", clientId: "a" });
    await sendMessage({ conversationId: id, authorId: alice, body: "Two", clientId: "b" });
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(2);
  });

  it("does not collide across conversations", async () => {
    if (!reachable) return;
    // The unique key is (conversation, clientId): two threads may legitimately
    // see the same key from the same client.
    const one = await freshThread();
    const group = await createGroupConversation(alice, [bob, carol], "Keys");
    await sendMessage({ conversationId: one, authorId: alice, body: "x", clientId: "same" });
    await sendMessage({ conversationId: group.id, authorId: alice, body: "x", clientId: "same" });
    expect(await prisma.message.count({ where: { clientId: "same" } })).toBe(2);
    await prisma.conversation.delete({ where: { id: group.id } });
  });
});

describe("paging", () => {
  it("opens a long thread on its newest page, not its oldest", async () => {
    if (!reachable) return;
    const id = await freshThread();
    // Written directly: sending fifty messages would trip the send limiter,
    // and what is under test is the read.
    const base = Date.now() - 60 * 60 * 1000;
    await prisma.message.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        conversationId: id,
        authorId: index % 2 === 0 ? alice : bob,
        body: `message ${index}`,
        createdAt: new Date(base + index * 1000),
      })),
    });

    const thread = await readConversation(id, alice);
    const bodies = thread!.messages.map((m) => m.body);
    // The bug this replaces: `orderBy asc, take: 200` showed the first page
    // forever, so the newest message was unreachable.
    expect(bodies.at(-1)).toBe("message 49");
    expect(bodies).not.toContain("message 0");
    expect(thread!.hasMore).toBe(true);
    // Still in reading order, oldest at the top of the window.
    expect(bodies[0]!.localeCompare(bodies.at(-1)!)).toBeLessThan(0);
  });

  it("pages backwards without repeating or skipping", async () => {
    if (!reachable) return;
    const id = await freshThread();
    const base = Date.now() - 60 * 60 * 1000;
    await prisma.message.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        conversationId: id,
        authorId: alice,
        body: `m${String(index).padStart(2, "0")}`,
        createdAt: new Date(base + index * 1000),
      })),
    });

    const first = await readConversation(id, alice);
    const older = await loadOlderMessages({
      conversationId: id,
      userId: alice,
      before: first!.messages[0]!.id,
    });
    const seen = [
      ...older!.messages.map((m) => m.body),
      ...first!.messages.map((m) => m.body),
    ];
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain("m00");
    expect(seen).toContain("m49");
  });

  it("refuses to page a thread the caller is not in", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await sendMessage({ conversationId: id, authorId: alice, body: "private" });
    const thread = await readConversation(id, alice);
    expect(
      await loadOlderMessages({
        conversationId: id,
        userId: stranger,
        before: thread!.messages[0]!.id,
      }),
    ).toBeNull();
  });
});

describe("unauthorized access", () => {
  it("gives a non-member nothing for a real conversation id", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await sendMessage({ conversationId: id, authorId: alice, body: "secret" });
    // A guessed id must be indistinguishable from one that does not exist.
    expect(await readConversation(id, stranger)).toBeNull();
  });

  it("refuses a send into a conversation the author is not in", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await expect(
      sendMessage({ conversationId: id, authorId: stranger, body: "hello" }),
    ).rejects.toBeInstanceOf(MessagePermissionError);
  });

  it("gives nothing for an id that does not exist at all", async () => {
    if (!reachable) return;
    expect(await readConversation("not-a-real-id", alice)).toBeNull();
  });
});

describe("blocking", () => {
  it("stops messages in both directions", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await blockMember(alice, bob);
    try {
      await expect(
        sendMessage({ conversationId: id, authorId: alice, body: "after block" }),
      ).rejects.toBeInstanceOf(MessagePermissionError);
      await expect(
        sendMessage({ conversationId: id, authorId: bob, body: "from the other side" }),
      ).rejects.toBeInstanceOf(MessagePermissionError);
    } finally {
      await unblockMember(alice, bob);
    }
  });

  it("lets the thread work again once unblocked", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await blockMember(alice, bob);
    await unblockMember(alice, bob);
    const message = await sendMessage({
      conversationId: id,
      authorId: alice,
      body: "back on",
    });
    expect(message.body).toBe("back on");
  });

  it("refuses to start a new thread across a block", async () => {
    if (!reachable) return;
    await blockMember(alice, carol);
    try {
      await expect(
        findOrCreateDirectConversation(alice, carol),
      ).rejects.toBeInstanceOf(MessagePermissionError);
    } finally {
      await unblockMember(alice, carol);
    }
  });
});

describe("dm preferences", () => {
  it("honours NOBODY", async () => {
    if (!reachable) return;
    await prisma.profile.update({
      where: { userId: carol },
      data: { dmPreference: "NOBODY" },
    });
    try {
      await expect(
        findOrCreateDirectConversation(stranger, carol),
      ).rejects.toBeInstanceOf(MessagePermissionError);
    } finally {
      await prisma.profile.update({
        where: { userId: carol },
        data: { dmPreference: "EVERYONE" },
      });
    }
  });
});

describe("groups", () => {
  it("creates a small group and delivers to everyone in it", async () => {
    if (!reachable) return;
    const group = await createGroupConversation(alice, [bob, carol], "Dinner");
    try {
      await sendMessage({
        conversationId: group.id,
        authorId: alice,
        body: "Who is bringing bread?",
      });
      for (const member of [bob, carol]) {
        const thread = await readConversation(group.id, member);
        expect(thread?.messages.map((m) => m.body)).toEqual([
          "Who is bringing bread?",
        ]);
        expect(thread?.isGroup).toBe(true);
      }
    } finally {
      await prisma.conversation.delete({ where: { id: group.id } });
    }
  });

  it("collapses a repeated invitee rather than counting them twice", async () => {
    if (!reachable) return;
    // A picker that submits the same person twice must not make a "group" of
    // one, and must not count them towards the size limit either.
    const group = await createGroupConversation(alice, [bob, bob, bob], null);
    try {
      expect(
        await prisma.conversationMember.count({
          where: { conversationId: group.id },
        }),
      ).toBe(2);
    } finally {
      await prisma.conversation.delete({ where: { id: group.id } });
    }
  });

  it("refuses a group larger than the limit", async () => {
    if (!reachable) return;
    // Genuinely distinct members: the limit counts people, not entries.
    const extras: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      extras.push(await makeUser(`crowd${index}`));
    }
    await clearLimits();
    await expect(
      createGroupConversation(alice, extras, null),
    ).rejects.toBeInstanceOf(MessagePermissionError);
  });

  it("refuses a group of one", async () => {
    if (!reachable) return;
    await expect(createGroupConversation(alice, [], null)).rejects.toBeInstanceOf(
      MessagePermissionError,
    );
  });
});

describe("unread counts", () => {
  it("counts what the badge claims, across threads", async () => {
    if (!reachable) return;
    const direct = await freshThread();
    const group = await createGroupConversation(alice, [bob, carol], "Counting");
    try {
      await sendMessage({ conversationId: direct, authorId: alice, body: "one" });
      await sendMessage({ conversationId: direct, authorId: alice, body: "two" });
      await sendMessage({ conversationId: group.id, authorId: alice, body: "three" });

      // Bob has read none of it.
      expect(await totalUnreadForUser(bob)).toBe(3);
      // Alice wrote all of it, so none of it is unread for her.
      expect(await totalUnreadForUser(alice)).toBe(0);
    } finally {
      await prisma.conversation.delete({ where: { id: group.id } });
    }
  });

  it("stops counting once read", async () => {
    if (!reachable) return;
    const id = await freshThread();
    await sendMessage({ conversationId: id, authorId: alice, body: "unread" });
    expect(await totalUnreadForUser(bob)).toBeGreaterThan(0);

    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: bob } },
      data: { lastReadAt: new Date() },
    });
    expect(await totalUnreadForUser(bob)).toBe(0);
  });

  it("ignores deleted messages", async () => {
    if (!reachable) return;
    const id = await freshThread();
    const message = await sendMessage({
      conversationId: id,
      authorId: alice,
      body: "removed",
    });
    await prisma.message.update({
      where: { id: message.id },
      data: { deletedAt: new Date() },
    });
    expect(await totalUnreadForUser(bob)).toBe(0);
  });

  it("is zero for somebody with no conversations", async () => {
    if (!reachable) return;
    expect(await totalUnreadForUser(stranger)).toBe(0);
  });
});

describe("rate limiting", () => {
  it("stops a runaway sender", async () => {
    if (!reachable) return;
    const id = await freshThread();

    // The window is spent directly rather than by sending a hundred and
    // thirty messages: the property under test is that `sendMessage` consults
    // the limiter, and a hundred and thirty sequential round trips is a slow
    // way to ask that — slow enough to outrun the test timeout under load.
    const { limit, windowMs } = MESSAGE_LIMITS.send;
    for (let index = 0; index < limit; index += 1) {
      await consumeRateLimit(`messages:send:${alice}`, limit, windowMs);
    }

    await expect(
      sendMessage({ conversationId: id, authorId: alice, body: "over the line" }),
    ).rejects.toBeInstanceOf(MessageRateLimitError);

    // And nothing was written on the way out.
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
    await clearLimits();
  });

  it("lets an ordinary burst through untouched", async () => {
    if (!reachable) return;
    const id = await freshThread();
    // Ten messages in a row is an argument, not an attack.
    for (let index = 0; index < 10; index += 1) {
      await sendMessage({
        conversationId: id,
        authorId: alice,
        body: `burst ${index}`,
        clientId: `burst-${index}`,
      });
    }
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(10);
  });
});
