import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductEvents } from "@/lib/analytics/events";

/**
 * A pace change is a product event (DEC-080): `roadmap_pace_changed`, sent
 * from the action once the pace is saved, carrying the number of weeks and
 * nothing about the member. A refused, failed or rate-limited change is not
 * counted. The roadmap domain is stubbed here; the database behaviour of
 * `setPace` is proven in tests/roadmap-flow.integration.test.ts.
 */

type FakeSession = { user: { id: string; roles: string[] } } | null;
const session = vi.hoisted(() => ({ current: null as FakeSession }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/server", () => analytics);

const limits = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(async () => ({ ok: true as boolean })),
}));
vi.mock("@/lib/auth/rate-limit", () => limits);

const kit = vi.hoisted(() => ({ queueRoadmapKitSync: vi.fn(async () => undefined) }));
vi.mock("@/lib/roadmap/kit-sync", () => kit);

const roadmap = vi.hoisted(() => ({
  setPace: vi.fn(async (_userId: string, weeks: unknown) => ({ weeksPerTopic: Number(weeks) })),
}));
vi.mock("@/lib/roadmap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/roadmap")>()),
  setPace: roadmap.setPace,
}));

const { setPaceAction } = await import("@/app/(member)/roadmap/actions");
const { RoadmapError } = await import("@/lib/roadmap");

const member: FakeSession = { user: { id: "member_1", roles: ["MEMBER"] } };

function paceForm(value: string | null): FormData {
  const form = new FormData();
  if (value !== null) form.set("weeksPerTopic", value);
  return form;
}

/** Runs the action and returns where it redirected. */
async function submit(form: FormData): Promise<string> {
  try {
    await setPaceAction(form);
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("the action did not redirect");
}

beforeEach(() => {
  session.current = member;
  analytics.track.mockClear();
  roadmap.setPace.mockClear();
  limits.consumeRateLimit.mockClear();
  limits.consumeRateLimit.mockImplementation(async () => ({ ok: true }));
  kit.queueRoadmapKitSync.mockClear();
});

describe("roadmap_pace_changed", () => {
  it("is sent once the pace is saved, with the weeks and nothing else", async () => {
    expect(await submit(paceForm("3"))).toBe("/roadmap?done=pace#pace");
    expect(roadmap.setPace).toHaveBeenCalledWith("member_1", 3);
    expect(analytics.track).toHaveBeenCalledTimes(1);
    const [distinctId, event, properties] = analytics.track.mock.calls[0]!;
    expect(distinctId).toBe("member_1");
    expect(event).toBe("roadmap_pace_changed");
    expect(properties).toEqual({ weeks_per_topic: 3 });
  });

  it("reports the pace that was saved, for each of the four", async () => {
    for (const weeks of [1, 2, 3, 4]) {
      analytics.track.mockClear();
      await submit(paceForm(String(weeks)));
      expect(analytics.track).toHaveBeenCalledWith("member_1", "roadmap_pace_changed", {
        weeks_per_topic: weeks,
      });
    }
  });

  it("is not sent for a pace the form should never have offered", async () => {
    for (const value of ["0", "5", "two", "", null]) {
      expect(await submit(paceForm(value))).toBe("/roadmap?error=pace");
    }
    expect(roadmap.setPace).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("is not sent when saving fails", async () => {
    roadmap.setPace.mockImplementationOnce(async () => {
      throw new RoadmapError("no-roadmap");
    });
    expect(await submit(paceForm("2"))).toBe("/roadmap?error=no-roadmap");
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("is not sent when the member is over the limit, or signed out", async () => {
    limits.consumeRateLimit.mockImplementationOnce(async () => ({ ok: false }));
    expect(await submit(paceForm("2"))).toBe("/roadmap?error=busy");

    session.current = null;
    expect(await submit(paceForm("2"))).toBe("/login?callbackUrl=/roadmap");

    expect(roadmap.setPace).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("leaves Kit alone, as every pace change does today", async () => {
    await submit(paceForm("4"));
    expect(kit.queueRoadmapKitSync).not.toHaveBeenCalled();
  });

  it("is declared with a number of weeks as its only property", () => {
    // A compile-time check: adding anything about the member to this event
    // would have to change this line.
    const sample: ProductEvents["roadmap_pace_changed"] = { weeks_per_topic: 2 };
    expect(Object.keys(sample)).toEqual(["weeks_per_topic"]);
  });
});
