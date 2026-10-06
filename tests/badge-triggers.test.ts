import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The badge check that runs after a lesson, a roadmap topic, an idea's status,
 * an RSVP or a two-way conversation (`lib/social/badge-triggers.ts`).
 *
 * What is under test is the contract every one of those call sites relies on:
 * inside a request the check waits for the response; outside one it runs in
 * place; and nothing it does, however it fails, reaches the member's action.
 * `after()`, the award itself and Sentry are stand-ins here.
 */

const state = vi.hoisted(() => ({
  /** True: behave as inside a request and queue the work. False: throw, as outside one. */
  inRequest: true,
  queued: [] as (() => Promise<void>)[],
}));

vi.mock("next/server", () => ({
  after: vi.fn((work: () => Promise<void>) => {
    if (!state.inRequest) throw new Error("`after` was called outside a request scope");
    state.queued.push(work);
  }),
}));

vi.mock("@/lib/social/badges", () => ({
  awardBadges: vi.fn(async () => []),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

const { awardBadgesAfterResponse } = await import("@/lib/social/badge-triggers");
const { awardBadges } = await import("@/lib/social/badges");
const Sentry = await import("@sentry/nextjs");

const award = vi.mocked(awardBadges);
const capture = vi.mocked(Sentry.captureException);

/** Runs whatever `after()` was handed, as Next does once the response is sent. */
async function sendResponse() {
  const work = state.queued.splice(0);
  for (const job of work) await job();
}

beforeEach(() => {
  state.inRequest = true;
  state.queued = [];
  award.mockReset();
  award.mockResolvedValue([]);
  capture.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("awardBadgesAfterResponse", () => {
  it("waits for the response inside a request", async () => {
    await awardBadgesAfterResponse("member-1", "lesson-complete");
    expect(award).not.toHaveBeenCalled();
    expect(state.queued).toHaveLength(1);

    await sendResponse();
    expect(award).toHaveBeenCalledTimes(1);
    expect(award).toHaveBeenCalledWith("member-1");
  });

  it("runs in place outside a request, so scripts and jobs still award", async () => {
    state.inRequest = false;
    await awardBadgesAfterResponse("member-1", "roadmap-topic");
    expect(award).toHaveBeenCalledWith("member-1");
  });

  it("checks each member once, and nobody for an empty list", async () => {
    state.inRequest = false;
    await awardBadgesAfterResponse(["a", "b", "a", ""], "live-class-rsvp");
    expect(award.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);

    award.mockClear();
    await awardBadgesAfterResponse([], "live-class-rsvp");
    expect(award).not.toHaveBeenCalled();
    expect(state.queued).toHaveLength(0);
  });

  it("works out who to check only after the response", async () => {
    const resolve = vi.fn(async () => ["author", "reader"]);
    await awardBadgesAfterResponse(resolve, "conversation-two-way");
    expect(resolve).not.toHaveBeenCalled();

    await sendResponse();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(award.mock.calls.map(([id]) => id)).toEqual(["author", "reader"]);
  });

  it("checks nobody when the answer is nobody", async () => {
    await awardBadgesAfterResponse(async () => [], "conversation-two-way");
    await sendResponse();
    expect(award).not.toHaveBeenCalled();
  });

  it("swallows a failed award, reports it, and still checks the next member", async () => {
    award.mockRejectedValueOnce(new Error("database went away"));
    await expect(
      awardBadgesAfterResponse(["first", "second"], "idea-planned"),
    ).resolves.toBeUndefined();
    await expect(sendResponse()).resolves.toBeUndefined();

    expect(award.mock.calls.map(([id]) => id)).toEqual(["first", "second"]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(expect.any(Error), {
      tags: { area: "badges", trigger: "idea-planned" },
    });
  });

  it("swallows a failure outside a request too", async () => {
    state.inRequest = false;
    award.mockRejectedValue(new Error("nope"));
    await expect(awardBadgesAfterResponse("member-1", "lesson-complete")).resolves.toBeUndefined();
    expect(capture).toHaveBeenCalledWith(expect.any(Error), {
      tags: { area: "badges", trigger: "lesson-complete" },
    });
  });

  it("swallows a failure working out who to check", async () => {
    await awardBadgesAfterResponse(async () => {
      throw new Error("lookup failed");
    }, "conversation-two-way");
    await expect(sendResponse()).resolves.toBeUndefined();
    expect(award).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(expect.any(Error), {
      tags: { area: "badges", trigger: "conversation-two-way" },
    });
  });
});
