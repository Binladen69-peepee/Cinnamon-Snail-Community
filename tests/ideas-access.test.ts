import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who reaches Ideas & Requests, decided before anything renders or writes.
 *
 * Signed-out visitors are sent to sign in and brought back to the idea they
 * asked for; every member action refuses without a session; every staff
 * action refuses a member, whatever they post at it. The domain layer is
 * stubbed here, so these prove the doors, and the integration suite proves
 * the rooms behind them.
 */

type FakeSession = { sessionId: string; user: { id: string; roles: string[] } } | null;
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
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ track: vi.fn() }));

const mutations = vi.hoisted(() => ({
  createIdea: vi.fn(async () => ({ id: "idea_1" })),
  toggleIdeaVote: vi.fn(async () => ({ voted: true, score: 2 })),
  updateIdea: vi.fn(async () => ({ id: "idea_1" })),
  withdrawIdea: vi.fn(async () => undefined),
  setIdeaStatus: vi.fn(async () => ({ changed: true })),
  mergeIdea: vi.fn(async () => ({ moved: 1, dropped: 0, targetScore: 2 })),
  setIdeaRemoved: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ideas/mutations", () => mutations);

const queries = vi.hoisted(() => ({
  findSimilarIdeas: vi.fn(async () => []),
  searchMergeTargets: vi.fn(async () => []),
  getIdeaDetail: vi.fn(async () => null),
  listIdeas: vi.fn(),
  listPlannedIdeas: vi.fn(async () => []),
  listIdeasForStaff: vi.fn(),
}));
vi.mock("@/lib/ideas/queries", () => queries);

async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
}

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

const member: FakeSession = { sessionId: "s1", user: { id: "member_1", roles: ["MEMBER"] } };
const admin: FakeSession = { sessionId: "s2", user: { id: "admin_1", roles: ["MEMBER", "ADMIN"] } };

beforeEach(() => {
  session.current = null;
  for (const fn of Object.values(mutations)) fn.mockClear();
  for (const fn of Object.values(queries)) fn.mockClear();
});

describe("signed out", () => {
  // The pages pull in the whole component tree, which takes a while to
  // transform the first time; the decision itself is instant.
  it("sends the board, the form and an idea to sign-in, and back again", { timeout: 120_000 }, async () => {
    const { default: IdeasPage } = await import("@/app/(member)/ideas/page");
    const { default: NewIdeaPage } = await import("@/app/(member)/ideas/new/page");
    const { default: IdeaPage } = await import("@/app/(member)/ideas/[id]/page");
    const { default: EditIdeaPage } = await import("@/app/(member)/ideas/[id]/edit/page");

    expect(await redirectedTo(() => IdeasPage({ searchParams: Promise.resolve({}) }))).toBe(
      "/login?callbackUrl=/ideas",
    );
    expect(await redirectedTo(() => NewIdeaPage({ searchParams: Promise.resolve({}) }))).toBe(
      "/login?callbackUrl=/ideas/new",
    );
    expect(
      await redirectedTo(() =>
        IdeaPage({ params: Promise.resolve({ id: "abc" }), searchParams: Promise.resolve({}) }),
      ),
    ).toBe(`/login?callbackUrl=${encodeURIComponent("/ideas/abc")}`);
    expect(await redirectedTo(() => EditIdeaPage({ params: Promise.resolve({ id: "abc" }) }))).toBe(
      `/login?callbackUrl=${encodeURIComponent("/ideas/abc/edit")}`,
    );
    expect(queries.listIdeas).not.toHaveBeenCalled();
    expect(queries.getIdeaDetail).not.toHaveBeenCalled();
  });

  it("refuses every member action without touching the board", async () => {
    const actions = await import("@/app/(member)/ideas/actions");
    for (const result of [
      await actions.submitIdeaAction(form({ title: "A class on tempeh", category: "CLASS" })),
      await actions.editIdeaAction(form({ ideaId: "idea_1", title: "x", category: "CLASS" })),
      await actions.toggleIdeaVoteAction(form({ ideaId: "idea_1" })),
      await actions.withdrawIdeaAction(form({ ideaId: "idea_1" })),
      await actions.reportIdeaAction(form({ ideaId: "idea_1", reason: "spam" })),
    ]) {
      expect(result).toEqual({ ok: false, error: "You need to sign in." });
    }
    expect(await actions.similarIdeasAction("tempeh class")).toEqual([]);
    for (const fn of Object.values(mutations)) expect(fn).not.toHaveBeenCalled();
    expect(queries.findSimilarIdeas).not.toHaveBeenCalled();
  });
});

describe("signed in as a member", () => {
  it("votes as themselves, whatever the form claims", async () => {
    session.current = member;
    const actions = await import("@/app/(member)/ideas/actions");
    const result = await actions.toggleIdeaVoteAction(
      form({ ideaId: "idea_1", userId: "someone_else" }),
    );
    expect(result).toEqual({ ok: true, voted: true, score: 2 });
    expect(mutations.toggleIdeaVote).toHaveBeenCalledWith({ userId: "member_1", ideaId: "idea_1" });
  });

  it("cannot reach a single staff action", async () => {
    session.current = member;
    const staff = await import("@/app/admin/ideas/actions");
    const refused = { ok: false, error: "Only the team can do that." };
    expect(
      await staff.setIdeaStatusAction(form({ ideaId: "idea_1", status: "PLANNED", note: "" })),
    ).toEqual(refused);
    expect(
      await staff.mergeIdeaAction(form({ sourceId: "idea_1", targetId: "idea_2" })),
    ).toEqual(refused);
    expect(await staff.setIdeaRemovedAction(form({ ideaId: "idea_1", removed: "1" }))).toEqual(
      refused,
    );
    expect(await staff.searchMergeTargetsAction("idea_1", "tempeh")).toEqual([]);
    expect(mutations.setIdeaStatus).not.toHaveBeenCalled();
    expect(mutations.mergeIdea).not.toHaveBeenCalled();
    expect(mutations.setIdeaRemoved).not.toHaveBeenCalled();
    expect(queries.searchMergeTargets).not.toHaveBeenCalled();
  });
});

describe("signed in as staff", () => {
  it("passes the staff member's own id down, for the database to check again", async () => {
    session.current = admin;
    const staff = await import("@/app/admin/ideas/actions");
    const result = await staff.setIdeaStatusAction(
      form({ ideaId: "idea_1", status: "PLANNED", note: "Filming in November." }),
    );
    expect(result.ok).toBe(true);
    expect(mutations.setIdeaStatus).toHaveBeenCalledWith({
      staffId: "admin_1",
      ideaId: "idea_1",
      status: "PLANNED",
      note: "Filming in November.",
    });
  });
});
