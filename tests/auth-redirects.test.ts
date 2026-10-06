import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEMBER_HOME_PATH, safeCallbackUrl } from "@/lib/auth/redirects";

/**
 * Signed-in members never see the sign-up page, and nobody is sent off-site.
 *
 * The pages and actions are called directly with Auth.js, the request headers
 * and Next's redirect stubbed: what matters is the decision each one makes
 * before anything renders, and the address it hands to `redirect`.
 */

const session = vi.hoisted(() => ({ current: null as null | { sessionId: string } }));
const signInCalls = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => session.current),
  signIn: vi.fn(async (_provider: string, options: Record<string, unknown>) => {
    signInCalls.push(options);
  }),
  socialSignIn: { google: false, facebook: false },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "members.example.com" })),
}));

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

// The forms are client components; the pages only need to hand them over.
vi.mock("@/app/(auth)/register/register-form", () => ({ RegisterForm: () => null }));
vi.mock("@/app/(auth)/login/login-form", () => ({ LoginForm: () => null }));

const registerAccount = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/register", () => ({ registerAccount }));
vi.mock("@/lib/analytics/server", () => ({ track: vi.fn() }));

async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
}

const params = (callbackUrl?: string) =>
  Promise.resolve(callbackUrl === undefined ? {} : { callbackUrl });

beforeEach(() => {
  session.current = null;
  signInCalls.length = 0;
  registerAccount.mockReset();
});

describe("safeCallbackUrl", () => {
  it("defaults to the Kitchen Table", () => {
    expect(MEMBER_HOME_PATH).toBe("/kitchen-table");
    expect(safeCallbackUrl(undefined)).toBe("/kitchen-table");
    expect(safeCallbackUrl(null)).toBe("/kitchen-table");
    expect(safeCallbackUrl("")).toBe("/kitchen-table");
    expect(safeCallbackUrl("   ")).toBe("/kitchen-table");
  });

  it("keeps a path on this site, query and fragment included", () => {
    expect(safeCallbackUrl("/messages?with=sam")).toBe("/messages?with=sam");
    expect(safeCallbackUrl("/posts/abc#comment-1")).toBe("/posts/abc#comment-1");
    expect(safeCallbackUrl("/")).toBe("/");
  });

  it("refuses every way of naming another site", () => {
    for (const hostile of [
      "//evil.example",
      "//evil.example/kitchen-table",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example/",
      "http://evil.example",
      "javascript:alert(1)",
      "evil.example",
      "kitchen-table",
    ]) {
      expect(safeCallbackUrl(hostile), JSON.stringify(hostile)).toBe("/kitchen-table");
    }
  });

  it("accepts an absolute address only on this host", () => {
    const host = "members.example.com";
    expect(safeCallbackUrl("https://members.example.com/messages?x=1", { host })).toBe(
      "/messages?x=1",
    );
    expect(safeCallbackUrl("https://MEMBERS.example.com/learn", { host })).toBe("/learn");
    expect(safeCallbackUrl("https://members.example.com.evil.example/", { host })).toBe(
      "/kitchen-table",
    );
    expect(safeCallbackUrl("https://members.example.com/learn")).toBe("/kitchen-table");
  });

  it("never sends someone back to an account page or a non-page", () => {
    for (const loop of [
      "/register",
      "/register?callbackUrl=/register",
      "/login",
      "/LOGIN",
      "/login/verify?token=x",
      "/forgot-password",
      "/reset-password?token=x",
      "/api/auth/signout",
      "/_next/static/chunk.js",
    ]) {
      expect(safeCallbackUrl(loop), loop).toBe("/kitchen-table");
    }
    expect(safeCallbackUrl("/login-help")).toBe("/login-help");
  });

  it("honours a different fallback", () => {
    expect(safeCallbackUrl("//evil.example", { fallback: "/settings" })).toBe("/settings");
  });
});

describe("the sign-up page", () => {
  it("sends a signed-in member to the Kitchen Table before rendering", async () => {
    session.current = { sessionId: "s1" };
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    expect(await redirectedTo(() => RegisterPage({ searchParams: params() }))).toBe(
      "/kitchen-table",
    );
  });

  it("sends them where the link was going when that is a page here", async () => {
    session.current = { sessionId: "s1" };
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    expect(await redirectedTo(() => RegisterPage({ searchParams: params("/learn/soups") }))).toBe(
      "/learn/soups",
    );
    expect(
      await redirectedTo(() =>
        RegisterPage({ searchParams: params("https://members.example.com/ideas") }),
      ),
    ).toBe("/ideas");
  });

  it("never follows a crafted callback off-site or back to itself", async () => {
    session.current = { sessionId: "s1" };
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    for (const hostile of ["//evil.example", "https://evil.example", "/register"]) {
      expect(await redirectedTo(() => RegisterPage({ searchParams: params(hostile) }))).toBe(
        "/kitchen-table",
      );
    }
  });

  it("shows the form to someone signed out", async () => {
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    expect(await redirectedTo(() => RegisterPage({ searchParams: params() }))).toBeNull();
  });

  it("treats a revoked session as signed out", async () => {
    // The session callback blanks sessionId when the row is revoked; the
    // token itself still decodes, so `session` alone is not proof.
    session.current = { sessionId: "" };
    const { default: RegisterPage } = await import("@/app/(auth)/register/page");
    expect(await redirectedTo(() => RegisterPage({ searchParams: params() }))).toBeNull();
  });
});

describe("the sign-in page", () => {
  it("sends a signed-in member on, to a safe address", async () => {
    session.current = { sessionId: "s1" };
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    expect(await redirectedTo(() => LoginPage({ searchParams: params() }))).toBe("/kitchen-table");
    expect(await redirectedTo(() => LoginPage({ searchParams: params("/messages") }))).toBe(
      "/messages",
    );
    expect(await redirectedTo(() => LoginPage({ searchParams: params("//evil.example") }))).toBe(
      "/kitchen-table",
    );
  });

  it("shows the form to someone signed out", async () => {
    const { default: LoginPage } = await import("@/app/(auth)/login/page");
    expect(await redirectedTo(() => LoginPage({ searchParams: params("/messages") }))).toBeNull();
  });
});

describe("the forms' actions", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it("will not open a second account for someone already signed in", async () => {
    session.current = { sessionId: "s1" };
    const { registerAction } = await import("@/app/(auth)/register/actions");
    const target = await redirectedTo(() =>
      registerAction({}, form({ email: "a@example.com", callbackUrl: "//evil.example" })),
    );
    expect(target).toBe("/kitchen-table");
    expect(registerAccount).not.toHaveBeenCalled();
  });

  it("signs a new member in to a safe address", async () => {
    registerAccount.mockResolvedValue({ ok: true, userId: "u1", email: "a@example.com" });
    const { registerAction } = await import("@/app/(auth)/register/actions");
    await registerAction({}, form({ email: "a@example.com", password: "pw", callbackUrl: "//evil.example" }));
    expect(signInCalls.at(-1)?.redirectTo).toBe("/kitchen-table");
  });

  it("signs a returning member in to a safe address", async () => {
    const { passwordSignInAction } = await import("@/app/(auth)/login/actions");
    await passwordSignInAction({}, form({ email: "a@example.com", password: "pw" }));
    expect(signInCalls.at(-1)?.redirectTo).toBe("/kitchen-table");
    await passwordSignInAction(
      {},
      form({ email: "a@example.com", password: "pw", callbackUrl: "/learn" }),
    );
    expect(signInCalls.at(-1)?.redirectTo).toBe("/learn");
    await passwordSignInAction(
      {},
      form({ email: "a@example.com", password: "pw", callbackUrl: "//evil.example" }),
    );
    expect(signInCalls.at(-1)?.redirectTo).toBe("/kitchen-table");
  });
});
