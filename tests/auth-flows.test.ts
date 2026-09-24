import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The guarantees of the account flows: register, reset, sign out.
 *
 * These are read from the source rather than exercised end to end, because
 * every one of them writes to the database and sends email. What they pin is
 * the handful of properties that are invisible in a manual test and expensive
 * to lose: that a reset kills existing sessions, that signing out revokes the
 * row rather than only dropping the cookie, and that the rate limiter is the
 * durable one rather than the per-instance Map.
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const register = read("lib/auth/register.ts");
const reset = read("lib/auth/password-reset.ts");
const limiter = read("lib/auth/rate-limit.ts");
const signOut = read("app/(auth)/sign-out-action.ts");
const proxy = read("proxy.ts");

describe("registration", () => {
  it("hashes the password and never stores it", () => {
    expect(register).toContain("hashPassword(input.password)");
    expect(register).not.toMatch(/password:\s*input\.password/);
  });

  it("validates on the server, whatever the form did", () => {
    expect(register).toContain("passwordProblems(input.password");
    expect(register).toMatch(/input\.password !== input\.confirm/);
    expect(register).toMatch(/if \(!input\.terms\)/);
  });

  it("rate limits by address and by origin", () => {
    expect(register).toContain("register-ip:");
    expect(register).toContain("register-email:");
  });

  it("does not trust its own existence check against a race", () => {
    // The unique index is the real guard; the lookup only produces a better
    // message. Losing the race must not surface as a crash.
    expect(register).toMatch(/catch\s*\{[\s\S]*?already has an account/);
  });

  it("leaves a new address unverified until a link is opened", () => {
    expect(register).toMatch(/emailVerified: null/);
    expect(register).toMatch(/verifiedAt: null/);
    expect(register).toContain("requestMagicLink");
  });

  it("is reachable, with a page and an action", () => {
    expect(existsSync(resolve(root, "app/(auth)/register/page.tsx"))).toBe(true);
    expect(read("app/(auth)/register/actions.ts")).toContain("registerAccount");
  });
});

describe("password reset", () => {
  it("keeps reset tokens in their own namespace", () => {
    // A magic-link token must never be spendable as a reset token: one proves
    // an address, the other changes the password guarding it.
    expect(reset).toMatch(/const RESET_PREFIX = "reset:"/);
    expect(reset).toContain("identifierFor");
  });

  it("stores only a hash of the token", () => {
    expect(reset).toContain("hashMagicToken(raw)");
    expect(reset).not.toMatch(/token:\s*raw\b/);
  });

  it("spends the token in one conditional update", () => {
    // updateMany with usedAt: null is what makes a forwarded link single-use;
    // read-then-write would let two submissions both succeed.
    expect(reset).toMatch(/updateMany\([\s\S]*?usedAt: null[\s\S]*?\}\)/);
    expect(reset).toContain("spent.count !== 1");
  });

  it("revokes every session once the password changes", () => {
    expect(reset).toContain("revokeAllSessions(user.id)");
  });

  it("says the same thing whether or not the account exists", () => {
    const action = read("app/(auth)/forgot-password/actions.ts");
    expect(action).toContain("sent: true");
    // Only the rate limit produces a different answer.
    expect(action.match(/return \{ error/g) ?? []).toHaveLength(2);
  });

  it("applies the password rules before it will write anything", () => {
    expect(reset).toContain("passwordProblems(password");
  });
});

describe("signing out", () => {
  it("revokes the session row, not just the cookie", () => {
    // Dropping the cookie leaves the row live, so a token copied beforehand
    // would still pass revalidation. This is the whole point of the blacklist.
    expect(signOut).toContain("revokeSession(session.sessionId");
    expect(signOut).toContain("signOut({ redirectTo:");
  });

  it("offers signing out everywhere as well", () => {
    expect(signOut).toContain("revokeAllSessions");
    expect(read("app/(member)/settings/page.tsx")).toContain(
      "signOutEverywhereAction",
    );
  });

  it("is what the header and the nav actually call", () => {
    for (const file of [
      "components/app/app-header.tsx",
      "components/layout/app-nav.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain("sign-out-action");
      expect(source, file).not.toMatch(/await signOut\(\{ redirectTo/);
    }
  });
});

describe("rate limiting", () => {
  it("counts in the database, so instances share one allowance", () => {
    expect(limiter).toContain('INSERT INTO "RateLimitBucket"');
    expect(limiter).toContain("ON CONFLICT");
  });

  it("increments and resets inside the same statement", () => {
    // Read-then-write leaks: two requests can both read four and both write
    // five. The CASE inside the upsert is what keeps the window honest.
    expect(limiter).toMatch(/DO UPDATE SET[\s\S]*?"count" = CASE/);
  });

  it("fails open rather than locking everyone out", () => {
    expect(limiter).toMatch(/catch\s*\{[\s\S]*?consumeRateLimitLocal/);
  });

  it("is what the credential and link paths use", () => {
    expect(read("auth.ts")).toContain("await consumeRateLimit(");
    expect(read("lib/auth/magic-link.ts")).toContain("await Promise.all([");
  });
});

describe("route protection", () => {
  const prefixes =
    proxy.match(/const memberPrefixes = \[([\s\S]*?)\]/)?.[1] ?? "";

  it("leaves the account flows reachable while signed out", () => {
    // Guarding these would mean only members could create an account or
    // recover one, which is nobody.
    for (const open of ["/register", "/forgot-password", "/reset-password"]) {
      expect(prefixes).not.toContain(`"${open}"`);
    }
  });

  it("sends a signed-in visitor away from them anyway", () => {
    for (const page of [
      "app/(auth)/register/page.tsx",
      "app/(auth)/forgot-password/page.tsx",
      "app/(auth)/reset-password/page.tsx",
    ]) {
      expect(read(page), page).toContain("redirect(");
    }
  });
});
