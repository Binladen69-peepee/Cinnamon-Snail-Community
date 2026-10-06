import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A member's own crews on arrival (DEC-078). Kit, the database, the claims and
 * the recompute are stand-ins; what is under test is when a visit may read
 * Kit, and that it only ever touches the visiting member.
 */

const state = vi.hoisted(() => ({
  kit: true,
  profile: null as { surveySyncedAt: Date | null; surveyTraits: unknown } | null,
  refused: new Set<string>(),
  claims: [] as string[],
  syncCalls: [] as Record<string, unknown>[],
  synced: 1,
  recomputeCalls: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/roadmap/kit-client", () => ({ kitConfigured: () => state.kit }));

vi.mock("@/lib/db", () => ({
  prisma: { profile: { findUnique: vi.fn(async () => state.profile) } },
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  consumeRateLimit: vi.fn(async (key: string) => {
    state.claims.push(key);
    return state.refused.has(key)
      ? { ok: false, remaining: 0, retryAfterMs: 1000 }
      : { ok: true, remaining: 1, retryAfterMs: 0 };
  }),
}));

vi.mock("@/lib/crews/kit-survey", () => ({
  RESYNC_AFTER_MS: 7 * 24 * 60 * 60 * 1000,
  syncKitSurveyTraits: vi.fn(async (options: Record<string, unknown>) => {
    state.syncCalls.push(options);
    return { synced: state.synced };
  }),
}));

vi.mock("@/lib/crews/recompute", () => ({
  recomputeCrews: vi.fn(async (options: Record<string, unknown>) => {
    state.recomputeCalls.push(options);
    return {};
  }),
}));

vi.mock("@/lib/crews/survey-traits", () => ({
  surveyMappingFromEnv: () => ({ configured: false, key: "default:v2", problems: [], rules: [] }),
  readStoredSurveyTraits: (raw: unknown) =>
    raw && typeof raw === "object" ? (raw as { mapping: string }) : null,
}));

const { refreshViewerCrews } = await import("@/lib/crews/visit");

const now = new Date("2026-10-06T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60_000);

beforeEach(() => {
  state.kit = true;
  state.profile = { surveySyncedAt: null, surveyTraits: null };
  state.refused = new Set();
  state.claims = [];
  state.syncCalls = [];
  state.synced = 1;
  state.recomputeCalls = [];
});

describe("refreshViewerCrews", () => {
  it("reads Kit for a member whose answers were never read, then recomputes only their crews", async () => {
    expect(await refreshViewerCrews("u1", { now })).toBe(true);
    expect(state.syncCalls).toEqual([
      expect.objectContaining({ userIds: ["u1"], limit: 1, record: false, trigger: "visit" }),
    ]);
    expect(state.recomputeCalls).toEqual([
      expect.objectContaining({ onlyUserIds: ["u1"], record: false, trigger: "visit" }),
    ]);
  });

  it("leaves answers read this week under the current mapping alone", async () => {
    state.profile = { surveySyncedAt: daysAgo(2), surveyTraits: { mapping: "default:v2" } };
    expect(await refreshViewerCrews("u1", { now })).toBe(false);
    expect(state.claims).toEqual([]);
    expect(state.syncCalls).toEqual([]);
  });

  it("reads again after a week, or when the mapping changed", async () => {
    state.profile = { surveySyncedAt: daysAgo(8), surveyTraits: { mapping: "default:v2" } };
    expect(await refreshViewerCrews("u1", { now })).toBe(true);

    state.profile = { surveySyncedAt: daysAgo(1), surveyTraits: { mapping: "default:v1" } };
    expect(await refreshViewerCrews("u2", { now })).toBe(true);
    expect(state.syncCalls).toHaveLength(2);
  });

  it("does nothing without Kit, or without a profile", async () => {
    state.kit = false;
    expect(await refreshViewerCrews("u1", { now })).toBe(false);
    state.kit = true;
    state.profile = null;
    expect(await refreshViewerCrews("u1", { now })).toBe(false);
    expect(state.syncCalls).toEqual([]);
  });

  it("reads one member at most once an hour, and the app at most 30 a minute", async () => {
    state.refused = new Set(["crews-visit:u1"]);
    expect(await refreshViewerCrews("u1", { now })).toBe(false);
    expect(state.claims).toEqual(["crews-visit:u1"]);

    state.refused = new Set(["crews-visit"]);
    state.claims = [];
    expect(await refreshViewerCrews("u2", { now })).toBe(false);
    expect(state.claims).toEqual(["crews-visit:u2", "crews-visit"]);
    expect(state.syncCalls).toEqual([]);
  });

  it("does not recompute when nothing was read (Kit down, or not a crew member)", async () => {
    state.synced = 0;
    expect(await refreshViewerCrews("u1", { now })).toBe(false);
    expect(state.recomputeCalls).toEqual([]);
  });
});
