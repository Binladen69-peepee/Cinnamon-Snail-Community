import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The visit-triggered Zoom refresh (DEC-079): the page's nudge between the
 * daily scheduled runs. The database, the claim and the sync itself are
 * stand-ins here; what is under test is when a visit is allowed to start a
 * sync, and that it never starts more than one.
 */

const state = vi.hoisted(() => ({
  latest: null as { startedAt: Date } | null,
  claims: 0,
  claimLimit: 1,
  findFirstArgs: [] as unknown[],
  syncCalls: [] as { trigger: string; now?: Date }[],
  changed: [] as string[],
  revalidated: [] as string[][],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    zoomSyncRun: {
      findFirst: vi.fn(async (args: unknown) => {
        state.findFirstArgs.push(args);
        return state.latest;
      }),
    },
  },
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => {
    state.claims += 1;
    return state.claims <= state.claimLimit
      ? { ok: true, remaining: 0, retryAfterMs: 0 }
      : { ok: false, remaining: 0, retryAfterMs: 1000 };
  }),
}));

vi.mock("@/lib/zoom/sync", () => ({
  runZoomSync: vi.fn(async (options: { trigger: string; now?: Date }) => {
    state.syncCalls.push(options);
    return {
      configured: true,
      ok: true,
      runId: "run_1",
      scanned: 1,
      created: state.changed.length,
      updated: 0,
      canceled: 0,
      errors: [],
      changed: state.changed,
    };
  }),
}));

vi.mock("@/lib/events/revalidate", () => ({
  revalidateLiveClasses: vi.fn((slugs: string[]) => {
    state.revalidated.push([...slugs]);
  }),
}));

const { ZOOM_REFRESH_AFTER_MS, refreshZoomIfStale } = await import("@/lib/zoom/refresh");

const config = { accountId: "acct", clientId: "id", clientSecret: "secret", userIds: ["me"] };
const now = new Date("2026-10-06T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

beforeEach(() => {
  state.latest = null;
  state.claims = 0;
  state.claimLimit = 1;
  state.findFirstArgs = [];
  state.syncCalls = [];
  state.changed = [];
  state.revalidated = [];
});

describe("refreshZoomIfStale", () => {
  it("does nothing at all when Zoom is not configured", async () => {
    expect(await refreshZoomIfStale({ config: null, now })).toBeNull();
    expect(state.findFirstArgs).toHaveLength(0);
    expect(state.claims).toBe(0);
    expect(state.syncCalls).toHaveLength(0);
  });

  it("leaves a fresh sync alone", async () => {
    state.latest = { startedAt: minutesAgo(20) };
    expect(await refreshZoomIfStale({ config, now })).toBeNull();
    expect(state.claims).toBe(0);
    expect(state.syncCalls).toHaveLength(0);
  });

  it("only counts full runs as fresh, never a one-meeting webhook run", async () => {
    await refreshZoomIfStale({ config, now });
    expect(state.findFirstArgs[0]).toMatchObject({
      where: { trigger: { in: ["cron", "manual", "visit"] } },
      orderBy: { startedAt: "desc" },
    });
  });

  it("syncs when the last full run is over an hour old", async () => {
    state.latest = { startedAt: minutesAgo(61) };
    const result = await refreshZoomIfStale({ config, now });
    expect(result?.runId).toBe("run_1");
    expect(state.syncCalls).toEqual([expect.objectContaining({ trigger: "visit", now })]);
  });

  it("syncs when Zoom has never been read", async () => {
    const result = await refreshZoomIfStale({ config, now });
    expect(result).not.toBeNull();
    expect(state.syncCalls).toHaveLength(1);
  });

  it("lets one visit through per hour, however many arrive at once", async () => {
    state.latest = { startedAt: minutesAgo(90) };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => refreshZoomIfStale({ config, now })),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state.syncCalls).toHaveLength(1);
  });

  it("refreshes the class pages only when the sync changed something", async () => {
    await refreshZoomIfStale({ config, now });
    expect(state.revalidated).toEqual([]);

    state.claims = 0;
    state.changed = ["cooking-live-class-oct-9"];
    await refreshZoomIfStale({ config, now });
    expect(state.revalidated).toEqual([["cooking-live-class-oct-9"]]);
  });

  it("waits an hour by default", () => {
    expect(ZOOM_REFRESH_AFTER_MS).toBe(60 * 60_000);
  });
});
