import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET } from "@/app/api/messages/[id]/poll/route";

vi.setConfig({ testTimeout: 30_000 });

/**
 * The thread poll, against real rows.
 *
 * A crew chat (DEC-078) is a room. When it is opened, messages from anyone on
 * either side of a block with the viewer are left out and there are no read
 * receipts; the poll that keeps it live used to send both anyway and leave
 * the browser to hide them. These prove the poll now leaves them out itself,
 * typing included, and that a one-to-one thread answers exactly as before.
 *
 * Needs the local Docker Postgres. Skips rather than fails when it is not
 * there.
 */

type FakeSession = { user: { id: string; roles: string[] } } | null;
const session = vi.hoisted(() => ({ current: null as FakeSession }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));

const prisma = new PrismaClient();
let reachable = true;
const stamp = Date.now().toString(36);

const ids = { viewer: "", friend: "", blocked: "", blocker: "", outsider: "" };
const handleOf = (key: keyof typeof ids) => `itpoll${key}${stamp}`;
let crewId = "";
let crewChat = "";
let direct = "";

type PollBody = {
  messages: { id: string; body: string; authorId: string; mine: boolean }[];
  typing: string[];
  readReceipts: { name: string; lastReadAt: string | null }[];
  previews: unknown[];
};

async function poll(conversationId: string, userId: string | null, query = "") {
  session.current = userId ? { user: { id: userId, roles: ["MEMBER"] } } : null;
  return GET(new Request(`http://localhost:3000/api/messages/${conversationId}/poll${query}`), {
    params: Promise.resolve({ id: conversationId }),
  });
}

/** Everyone but the viewer is typing right now (the flag lasts six seconds). */
async function typingNow(conversationId: string) {
  await prisma.conversationMember.updateMany({
    where: { conversationId, userId: { not: ids.viewer } },
    data: { typingAt: new Date() },
  });
}

async function pollBody(conversationId: string, userId: string, query = ""): Promise<PollBody> {
  const response = await poll(conversationId, userId, query);
  expect(response.status).toBe(200);
  return (await response.json()) as PollBody;
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
    const user = await prisma.user.create({
      data: {
        email: `it-poll-${key}-${stamp}@example.test`,
        handle: handleOf(key),
        name: `Poll ${key}`,
        status: "ACTIVE",
        profile: { create: { displayName: `Poll ${key}` } },
      },
      select: { id: true },
    });
    ids[key] = user.id;
  }

  // The viewer blocked one member; another member blocked the viewer.
  await prisma.userBlock.createMany({
    data: [
      { blockerId: ids.viewer, blockedId: ids.blocked },
      { blockerId: ids.blocker, blockedId: ids.viewer },
    ],
  });

  const now = new Date();
  const everyone = [ids.viewer, ids.friend, ids.blocked, ids.blocker];
  const chat = await prisma.conversation.create({
    data: {
      isGroup: true,
      title: `Poll crew ${stamp}`,
      lastMessageAt: now,
      members: {
        create: everyone.map((userId) => ({
          userId,
          lastReadAt: now,
          // Everybody else is mid-sentence.
          typingAt: userId === ids.viewer ? null : now,
        })),
      },
    },
    select: { id: true },
  });
  crewChat = chat.id;
  const crew = await prisma.crew.create({
    data: {
      slug: `it-poll-crew-${stamp}`,
      name: `Poll crew ${stamp}`,
      kind: "OPTIONAL",
      conversationId: crewChat,
    },
    select: { id: true },
  });
  crewId = crew.id;

  const base = Date.now() - 60_000;
  const say = (conversationId: string, authorId: string, body: string, offset: number) =>
    prisma.message.create({
      data: { conversationId, authorId, body, createdAt: new Date(base + offset * 1000) },
    });
  await say(crewChat, ids.friend, "Friend: the tofu is pressed.", 1);
  // A link that unfurls into a preview card for anyone allowed to read it.
  await say(crewChat, ids.blocked, `Blocked: http://localhost:3000/members/${handleOf("blocker")}`, 2);
  await say(crewChat, ids.blocker, "Blocker: hello crew", 3);
  await say(crewChat, ids.viewer, "Viewer: on my way", 4);
  await say(crewChat, ids.friend, "Friend: bring the pan", 5);

  const pair = await prisma.conversation.create({
    data: {
      isGroup: false,
      lastMessageAt: now,
      members: {
        create: [
          { userId: ids.viewer, lastReadAt: now },
          { userId: ids.blocked, lastReadAt: now, typingAt: now },
        ],
      },
    },
    select: { id: true },
  });
  direct = pair.id;
  // Written before the block: a one-to-one thread keeps its history.
  await say(direct, ids.blocked, "Before the block", 1);
  await say(direct, ids.viewer, "Reply", 2);
});

afterAll(async () => {
  if (reachable) {
    if (crewId) await prisma.crew.delete({ where: { id: crewId } }).catch(() => {});
    await prisma.conversation
      .deleteMany({ where: { id: { in: [crewChat, direct].filter(Boolean) } } })
      .catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: Object.values(ids).filter(Boolean) } } })
      .catch(() => {});
  }
  session.current = null;
  await prisma.$disconnect().catch(() => {});
});

describe("the door", () => {
  it("asks for a session, and answers 404 to someone who is not in the thread", async () => {
    if (!reachable) return;
    expect((await poll(crewChat, null)).status).toBe(401);
    expect((await poll(crewChat, ids.outsider)).status).toBe(404);
  });
});

describe("a crew chat", () => {
  it("leaves out every message from either side of a block with the viewer", async () => {
    if (!reachable) return;
    const body = await pollBody(crewChat, ids.viewer);
    expect(body.messages.map((message) => message.body)).toEqual([
      "Friend: the tofu is pressed.",
      "Viewer: on my way",
      "Friend: bring the pan",
    ]);
    const authors = new Set(body.messages.map((message) => message.authorId));
    expect(authors.has(ids.blocked)).toBe(false);
    expect(authors.has(ids.blocker)).toBe(false);
  });

  it("sends no read receipts, and no 'typing' for anyone hidden", async () => {
    if (!reachable) return;
    await typingNow(crewChat);
    const body = await pollBody(crewChat, ids.viewer);
    expect(body.readReceipts).toEqual([]);
    expect(body.typing).toEqual(["Poll friend"]);
  });

  it("unfurls no link from a hidden message", async () => {
    if (!reachable) return;
    const hidden = await pollBody(crewChat, ids.viewer);
    expect(hidden.previews).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain(handleOf("blocker"));
    // The same link is unfurled for someone who may read it.
    const shown = await pollBody(crewChat, ids.friend);
    expect(JSON.stringify(shown.previews)).toContain(`/members/${handleOf("blocker")}`);
  });

  it("keeps the rule when asking for what is new since a message", async () => {
    if (!reachable) return;
    const all = await pollBody(crewChat, ids.viewer);
    const first = await prisma.message.findFirstOrThrow({
      where: { conversationId: crewChat, authorId: ids.friend },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const since = await pollBody(
      crewChat,
      ids.viewer,
      `?since=${encodeURIComponent(first.createdAt.toISOString())}`,
    );
    expect(since.messages.map((message) => message.body)).toEqual(
      all.messages.slice(1).map((message) => message.body),
    );
  });

  it("still shows everyone who is not blocked everything, receipts aside", async () => {
    if (!reachable) return;
    const body = await pollBody(crewChat, ids.friend);
    expect(body.messages).toHaveLength(5);
    expect(body.readReceipts).toEqual([]);
  });
});

describe("a one-to-one thread", () => {
  it("answers as before: every message, read receipts and typing", async () => {
    if (!reachable) return;
    await typingNow(direct);
    const body = await pollBody(direct, ids.viewer);
    expect(body.messages.map((message) => message.body)).toEqual(["Before the block", "Reply"]);
    expect(body.readReceipts).toEqual([
      { name: "Poll blocked", lastReadAt: expect.any(String) },
    ]);
    expect(body.typing).toEqual(["Poll blocked"]);
  });
});
