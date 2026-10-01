import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backoffMs,
  isEmptyPlan,
  planKitChanges,
  roadmapKitState,
  type AppliedState,
} from "@/lib/roadmap/kit-sync";
import { httpKitClient, KitApiError } from "@/lib/roadmap/kit-client";

const track = { slug: "busy", kitTag: "111", kitCompletedTag: "999" };
const ms = (pattern: string) =>
  [...pattern].map((c) => ({ done: c === "d", skipped: c === "s" }));

describe("roadmapKitState", () => {
  it("describes a member part-way through", () => {
    expect(roadmapKitState({ cadence: "weekly", paused: false, track, milestones: ms("ds..") })).toEqual({
      fields: { track: "busy", status: "active", step: "3 of 4", completed: "1", cadence: "weekly" },
      trackTags: ["111"],
      completedTags: [],
    });
  });

  it("says paused, and finished wins over paused", () => {
    expect(roadmapKitState({ cadence: "monthly", paused: true, track, milestones: ms("d.") }).fields.status).toBe("paused");
    const done = roadmapKitState({ cadence: "monthly", paused: true, track, milestones: ms("dd") });
    expect(done.fields).toMatchObject({ status: "completed", step: "", completed: "2" });
    expect(done.completedTags).toEqual(["999"]);
  });

  it("clears everything for a member with no roadmap", () => {
    expect(roadmapKitState(null)).toEqual({
      fields: { track: "", status: "none", step: "", completed: "0", cadence: "" },
      trackTags: [],
      completedTags: [],
    });
  });
});

describe("planKitChanges", () => {
  const empty: AppliedState = { fields: {}, trackTags: [], completedTags: [] };

  it("sends nothing when Kit already matches", () => {
    const state = roadmapKitState({ cadence: "weekly", paused: false, track, milestones: ms("d.") });
    const applied: AppliedState = { fields: state.fields, trackTags: ["111"], completedTags: [] };
    expect(isEmptyPlan(planKitChanges(applied, state))).toBe(true);
  });

  it("sends only the fields that changed", () => {
    const before = roadmapKitState({ cadence: "weekly", paused: false, track, milestones: ms("d..") });
    const after = roadmapKitState({ cadence: "weekly", paused: false, track, milestones: ms("dd.") });
    const plan = planKitChanges({ fields: before.fields, trackTags: ["111"], completedTags: [] }, after);
    expect(plan).toEqual({ fields: { step: "3 of 3", completed: "2" }, addTrackTags: [], addCompletedTags: [], removeTags: [] });
  });

  it("swaps the track tag on a switch", () => {
    const next = roadmapKitState({
      cadence: "weekly",
      paused: false,
      track: { slug: "family", kitTag: "222", kitCompletedTag: null },
      milestones: ms(".."),
    });
    const plan = planKitChanges({ fields: {}, trackTags: ["111"], completedTags: [] }, next);
    expect(plan.addTrackTags).toEqual(["222"]);
    expect(plan.removeTags).toEqual(["111"]);
  });

  it("never removes a completion tag, even after a restart or leaving", () => {
    const applied: AppliedState = { fields: {}, trackTags: ["111"], completedTags: ["999"] };
    const restarted = roadmapKitState({ cadence: "weekly", paused: false, track, milestones: ms("..") });
    expect(planKitChanges(applied, restarted).removeTags).toEqual([]);
    const left = planKitChanges(applied, roadmapKitState(null));
    expect(left.removeTags).toEqual(["111"]);
    expect(left.removeTags).not.toContain("999");
  });

  it("treats an id used for both tags as a completion tag", () => {
    const same = { slug: "x", kitTag: "5", kitCompletedTag: "5" };
    const plan = planKitChanges(empty, roadmapKitState({ cadence: "weekly", paused: false, track: same, milestones: ms("d") }));
    expect(plan.addCompletedTags).toEqual(["5"]);
    expect(plan.addTrackTags).toEqual([]);
  });
});

describe("backoff", () => {
  it("grows and caps", () => {
    expect(backoffMs(1)).toBe(5 * 60 * 1000);
    expect(backoffMs(3)).toBe(20 * 60 * 1000);
    expect(backoffMs(40)).toBe(12 * 60 * 60 * 1000);
  });
});

describe("httpKitClient", () => {
  const calls: { method: string; url: string; body: unknown }[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
  });

  function stub(responses: { status: number; json?: unknown }[]) {
    process.env.KIT_API_KEY = "key";
    process.env.KIT_API_SECRET = "secret";
    vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      const next = responses.shift() ?? { status: 200, json: {} };
      return new Response(JSON.stringify(next.json ?? {}), { status: next.status });
    });
  }

  it("matches a subscriber by exact address and keeps Kit's own address", async () => {
    stub([{ status: 200, json: { subscribers: [{ id: 7, email_address: "Sam@Example.com", state: "active" }] } }]);
    const found = await httpKitClient().findSubscriber("sam@example.com");
    expect(found).toEqual({ id: "7", state: "active", email: "Sam@Example.com" });
    expect(calls[0]!.url).toContain("/subscribers?api_secret=secret&email_address=sam%40example.com");
  });

  it("updates fields, adds and removes tags with the documented v3 calls", async () => {
    stub([{ status: 200 }, { status: 200 }, { status: 404 }]);
    const kit = httpKitClient();
    await kit.updateFields("7", { vu_roadmap_track: "busy" });
    await kit.addTag("111", "sam@example.com");
    await kit.removeTag("7", "111"); // 404: already gone, which is fine
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "PUT /v3/subscribers/7",
      "POST /v3/tags/111/subscribe",
      "DELETE /v3/subscribers/7/tags/111",
    ]);
    expect(calls[0]!.body).toEqual({ api_secret: "secret", fields: { vu_roadmap_track: "busy" } });
  });

  it("grades failures: 5xx and 429 retry, other 4xx do not", async () => {
    stub([{ status: 503 }, { status: 401 }]);
    const kit = httpKitClient();
    const transient = await kit.updateFields("7", {}).catch((e) => e);
    const permanent = await kit.updateFields("7", {}).catch((e) => e);
    expect(transient).toBeInstanceOf(KitApiError);
    expect(transient.transient).toBe(true);
    expect(permanent.transient).toBe(false);
  });
});
