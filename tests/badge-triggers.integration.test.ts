import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Where badges are re-checked, against the database.
 *
 * Each of these is a moment a badge ladder can move, and each now asks for
 * the check after the response: a lesson completed for the first time, a
 * roadmap topic completed, an idea moved to Planned or Done (for its author),
 * an RSVP that became "going", and the reply that makes a one-to-one thread
 * two-way (for both people). The real actions run against real rows; only
 * `awardBadges` is a stand-in, so what is proved is who it is asked about and
 * when, and that a check that fails never fails the action.
 *
 * Needs the local Docker Postgres. Skips rather than fails without it.
 */

vi.setConfig({ testTimeout: 20_000 });

vi.mock("@/lib/social/badges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social/badges")>()),
  awardBadges: vi.fn(async () => []),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { awardBadges } from "@/lib/social/badges";
import { saveLessonProgress } from "@/lib/learn/progress";
import { completeMilestone, skipMilestone, startTrack } from "@/lib/roadmap";
import { setIdeaStatus } from "@/lib/ideas/mutations";
import { setRsvp } from "@/lib/events/rsvp";
import {
  createGroupConversation,
  findOrCreateDirectConversation,
  sendMessage,
} from "@/lib/messages/conversations";
import { getIdeasSpaceId } from "@/lib/community/system-spaces";

const award = vi.mocked(awardBadges);
const capture = vi.mocked(Sentry.captureException);

const prisma = new PrismaClient();
const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let reachable = true;

const users = {
  learner: "",
  author: "",
  staff: "",
  alice: "",
  bob: "",
  carol: "",
  first: "",
  second: "",
};
let courseId = "";
const lessons: string[] = [];
let trackId = "";
const milestones: string[] = [];
const ideas: string[] = [];
const events: string[] = [];
const conversations: string[] = [];

/** Who `awardBadges` was asked about since the last reset, in order. */
const checked = () => award.mock.calls.map(([userId]) => userId);

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }

  for (const key of Object.keys(users) as (keyof typeof users)[]) {
    users[key] = (
      await prisma.user.create({
        data: {
          email: `it-badgetrig-${stamp}-${key}@example.test`,
          handle: `itbt${stamp}${key}`.slice(0, 32),
          name: `Trigger ${key}`,
          status: "ACTIVE",
          profile: { create: { displayName: `Trigger ${key}`, dmPreference: "EVERYONE" } },
        },
        select: { id: true },
      })
    ).id;
  }
  const admin = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: { name: "ADMIN" },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: users.staff, roleId: admin.id } });

  // Preview lessons: open to any signed-in member, so no entitlement is needed.
  const course = await prisma.course.create({
    data: {
      slug: `it-badgetrig-${stamp}`,
      title: "Trigger cook-along",
      description: "A class that exists only for this test file.",
      published: true,
      sections: {
        create: {
          title: "Week one",
          sortOrder: 0,
          lessons: {
            create: [0, 1, 2].map((index) => ({
              title: `Lesson ${index}`,
              slug: `lesson-${index}`,
              kind: "TEXT" as const,
              body: "Read this.",
              isPreview: true,
              sortOrder: index,
            })),
          },
        },
      },
    },
    select: {
      id: true,
      sections: { select: { lessons: { orderBy: { sortOrder: "asc" }, select: { id: true } } } },
    },
  });
  courseId = course.id;
  lessons.push(...course.sections[0]!.lessons.map((lesson) => lesson.id));

  // Topics with neither a lesson nor a recipe: the goal alone completes them.
  const track = await prisma.roadmapTrack.create({
    data: {
      slug: `it-badgetrig-${stamp}`,
      name: `Trigger track ${stamp}`,
      published: true,
      milestones: {
        create: [1, 2, 3].map((sortOrder) => ({
          sortOrder,
          topic: `Topic ${sortOrder}`,
          learningGoal: "Do the thing.",
        })),
      },
    },
    include: { milestones: { orderBy: { sortOrder: "asc" } } },
  });
  trackId = track.id;
  milestones.push(...track.milestones.map((milestone) => milestone.id));
});

afterAll(async () => {
  if (reachable) {
    const ids = Object.values(users).filter(Boolean);
    await prisma.conversation.deleteMany({ where: { id: { in: conversations } } });
    await prisma.post.deleteMany({ where: { id: { in: ideas } } });
    await prisma.event.deleteMany({ where: { id: { in: events } } });
    await prisma.memberRoadmap.deleteMany({ where: { userId: { in: ids } } });
    await prisma.roadmapTrack.deleteMany({ where: { id: trackId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.rateLimitBucket.deleteMany({
      where: { OR: ids.map((id) => ({ key: { contains: id } })) },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  award.mockReset();
  award.mockResolvedValue([]);
  capture.mockReset();
});

describe("a lesson completed for the first time", () => {
  it("checks the member once, and not on later saves", async ({ skip }) => {
    if (!reachable) skip();
    const [lesson] = lessons;

    // Opening it and getting partway is not completing it.
    await saveLessonProgress({ userId: users.learner, lessonId: lesson!, positionSeconds: 30 });
    expect(checked()).toEqual([]);

    const done = await saveLessonProgress({
      userId: users.learner,
      lessonId: lesson!,
      positionSeconds: 0,
      completed: true,
    });
    expect(done.completed).toBe(true);
    expect(checked()).toEqual([users.learner]);

    // The heartbeat and a rewatch of a finished lesson are not completions.
    await saveLessonProgress({ userId: users.learner, lessonId: lesson!, positionSeconds: 12 });
    await saveLessonProgress({
      userId: users.learner,
      lessonId: lesson!,
      positionSeconds: 0,
      completed: true,
    });
    expect(checked()).toEqual([users.learner]);
  });

  it("counts reaching the end as completing it", async ({ skip }) => {
    if (!reachable) skip();
    const lesson = lessons[1]!;
    await saveLessonProgress({
      userId: users.learner,
      lessonId: lesson,
      positionSeconds: 96,
      durationSeconds: 100,
    });
    expect(checked()).toEqual([users.learner]);
  });

  it("checks again when a lesson marked unfinished is finished again", async ({ skip }) => {
    if (!reachable) skip();
    const lesson = lessons[2]!;
    await saveLessonProgress({
      userId: users.learner,
      lessonId: lesson,
      positionSeconds: 0,
      completed: true,
    });
    // What "mark unfinished" writes.
    await prisma.lessonProgress.update({
      where: { lessonId_userId: { lessonId: lesson, userId: users.learner } },
      data: { completedAt: null },
    });
    await saveLessonProgress({
      userId: users.learner,
      lessonId: lesson,
      positionSeconds: 0,
      completed: true,
    });
    expect(checked()).toEqual([users.learner, users.learner]);
  });
});

describe("a roadmap topic", () => {
  it("checks the member when a topic is completed, and never for a skip", async ({ skip }) => {
    if (!reachable) skip();
    await startTrack(users.learner, trackId);
    expect(checked()).toEqual([]);

    await completeMilestone(users.learner, milestones[0]!);
    expect(checked()).toEqual([users.learner]);

    await skipMilestone(users.learner, milestones[1]!);
    expect(checked()).toEqual([users.learner]);
  });
});

describe("an idea's status", () => {
  async function newIdea() {
    const spaceId = await getIdeasSpaceId();
    const post = await prisma.post.create({
      data: {
        spaceId,
        authorId: users.author,
        type: "IDEA",
        status: "PUBLISHED",
        title: `Smoked tofu class ${stamp} ${ideas.length}`,
        body: "Please.",
        plainText: "Please.",
        publishedAt: new Date(),
        idea: { create: { category: "CLASS", status: "OPEN" } },
      },
      select: { id: true },
    });
    ideas.push(post.id);
    return post.id;
  }

  it("checks the author, not staff, when it moves to Planned or Done", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea();

    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "UNDER_REVIEW" });
    expect(checked()).toEqual([]);

    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "PLANNED" });
    expect(checked()).toEqual([users.author]);

    // A note edit on the same status is not a move.
    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "PLANNED", note: "Soon." });
    expect(checked()).toEqual([users.author]);

    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "DONE" });
    expect(checked()).toEqual([users.author, users.author]);
  });

  it("does not check anyone for a decline", async ({ skip }) => {
    if (!reachable) skip();
    const id = await newIdea();
    await setIdeaStatus({ staffId: users.staff, ideaId: id, status: "DECLINED" });
    expect(checked()).toEqual([]);
  });
});

describe("a live-class RSVP", () => {
  async function newClass(capacity: number | null) {
    const startsAt = new Date(Date.now() + 7 * 86_400_000);
    const event = await prisma.event.create({
      data: {
        slug: `it-badgetrig-${stamp}-${events.length}`,
        title: "Trigger live class",
        startsAt,
        timezone: "UTC",
        capacity,
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    events.push(event.id);
    return event.id;
  }

  it("checks the member when they become going, once", async ({ skip }) => {
    if (!reachable) skip();
    const eventId = await newClass(null);

    await setRsvp({ userId: users.first, eventId, status: "GOING" });
    expect(checked()).toEqual([users.first]);

    // Pressing it again, or standing down, is not becoming "going".
    await setRsvp({ userId: users.first, eventId, status: "GOING" });
    await setRsvp({ userId: users.first, eventId, status: "NOT_GOING" });
    expect(checked()).toEqual([users.first]);
  });

  it("checks nobody for a waitlist place, and the member a freed seat promotes", async ({
    skip,
  }) => {
    if (!reachable) skip();
    const eventId = await newClass(1);
    await setRsvp({ userId: users.first, eventId, status: "GOING" });
    award.mockClear();

    const waiting = await setRsvp({ userId: users.second, eventId, status: "GOING" });
    expect(waiting.status).toBe("WAITLIST");
    expect(checked()).toEqual([]);

    await setRsvp({ userId: users.first, eventId, status: "NOT_GOING" });
    expect(checked()).toEqual([users.second]);
  });
});

describe("a direct message", () => {
  it("checks both people when a reply makes the thread two-way, and only then", async ({
    skip,
  }) => {
    if (!reachable) skip();
    const thread = await findOrCreateDirectConversation(users.alice, users.bob);
    conversations.push(thread.id);

    await sendMessage({ conversationId: thread.id, authorId: users.alice, body: "Hi Bob!" });
    await sendMessage({ conversationId: thread.id, authorId: users.alice, body: "Still there?" });
    expect(checked()).toEqual([]);

    await sendMessage({ conversationId: thread.id, authorId: users.bob, body: "Hi Alice!" });
    expect(checked()).toEqual([users.bob, users.alice]);

    await sendMessage({ conversationId: thread.id, authorId: users.bob, body: "How are you?" });
    await sendMessage({ conversationId: thread.id, authorId: users.alice, body: "Good!" });
    expect(checked()).toEqual([users.bob, users.alice]);
  });

  it("does not count a group thread", async ({ skip }) => {
    if (!reachable) skip();
    const group = await createGroupConversation(users.alice, [users.bob, users.carol], "Supper club");
    conversations.push(group.id);

    await sendMessage({ conversationId: group.id, authorId: users.alice, body: "Hello all" });
    await sendMessage({ conversationId: group.id, authorId: users.carol, body: "Hi!" });
    expect(checked()).toEqual([]);
  });
});

describe("a check that fails", () => {
  it("never fails the action, and is reported", async ({ skip }) => {
    if (!reachable) skip();
    award.mockRejectedValue(new Error("badge check exploded"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => logged.mockRestore());

    const progress = await saveLessonProgress({
      userId: users.carol,
      lessonId: lessons[0]!,
      positionSeconds: 0,
      completed: true,
    });
    expect(progress.completed).toBe(true);

    await startTrack(users.carol, trackId);
    await expect(completeMilestone(users.carol, milestones[0]!)).resolves.toEqual({
      trackComplete: false,
    });

    const idea = ideas[0]!;
    await expect(
      setIdeaStatus({ staffId: users.staff, ideaId: idea, status: "OPEN" }),
    ).resolves.toEqual({ changed: true });
    await expect(
      setIdeaStatus({ staffId: users.staff, ideaId: idea, status: "PLANNED" }),
    ).resolves.toEqual({ changed: true });

    const eventId = events[0]!;
    await expect(setRsvp({ userId: users.carol, eventId, status: "GOING" })).resolves.toMatchObject({
      status: "GOING",
    });

    const thread = await findOrCreateDirectConversation(users.carol, users.first);
    conversations.push(thread.id);
    await sendMessage({ conversationId: thread.id, authorId: users.carol, body: "Hello" });
    const reply = await sendMessage({
      conversationId: thread.id,
      authorId: users.first,
      body: "Hello back",
    });
    expect(reply.body).toBe("Hello back");

    // Lesson, topic, idea (its author), RSVP, and both sides of the thread.
    expect(checked()).toEqual([
      users.carol,
      users.carol,
      users.author,
      users.carol,
      users.first,
      users.carol,
    ]);
    expect(capture).toHaveBeenCalledTimes(6);
    for (const [, context] of capture.mock.calls) {
      expect(context).toMatchObject({ tags: { area: "badges" } });
    }
  });
});
