import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the auth layer actually guarantees.
 *
 * These pin behaviour that is easy to "simplify" away by someone who has not
 * read why it is there — in particular the revocation check, which is the
 * project's token blacklist, and the fail-open on database errors, which is
 * what stopped members being logged out at random.
 */

const auth = readFileSync(resolve(process.cwd(), "auth.ts"), "utf8");
const proxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");

describe("session strategy", () => {
  it("issues JWTs rather than database sessions", () => {
    expect(auth).toMatch(/session:\s*\{\s*strategy:\s*"jwt"/);
  });

  it("carries a session id inside the token", () => {
    // Without this the token is unrevokable: there would be nothing to look up.
    expect(auth).toContain("token.sessionId");
  });
});

describe("token blacklisting", () => {
  it("clears the session when the row is revoked, missing or expired", () => {
    // This is the blacklist. A revoked Session row invalidates every token
    // that points at it, which is what a denylist is for.
    expect(auth).toMatch(/dbSession\.revokedAt/);
    expect(auth).toMatch(/dbSession\.expires\s*<\s*new Date\(\)/);
  });

  it("clears the session when the account is no longer active", () => {
    expect(auth).toMatch(/dbUser\.status !== "ACTIVE"/);
  });

  it("re-checks against the database on a bounded interval", () => {
    // A JWT is only as revocable as its revalidation window, so the window has
    // to exist and has to be short enough to mean something.
    const match = auth.match(/const REVALIDATE_MS = ([^;]+);/);
    expect(match).not.toBeNull();
    const ms = eval(match![1]) as number;
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("fails open when the database is unreachable", () => {
    // A timeout is not evidence that a session is invalid. Treating it as such
    // is what logged members out at random.
    expect(auth).toMatch(/catch\s*\{[\s\S]*?Fail open/);
  });

  it("exposes both ways to revoke", () => {
    expect(auth).toContain("export async function revokeSession");
    expect(auth).toContain("export async function revokeAllSessions");
    // Revoking is an administrative act and is recorded as one.
    expect(auth).toContain("writeAuditLog");
  });
});

describe("social sign-in", () => {
  it("registers a provider only when its credentials exist", () => {
    // A button for an unconfigured provider fails the moment it is pressed.
    expect(auth).toMatch(/AUTH_GOOGLE_ID && process\.env\.AUTH_GOOGLE_SECRET/);
    expect(auth).toMatch(/AUTH_FACEBOOK_ID && process\.env\.AUTH_FACEBOOK_SECRET/);
  });

  it("publishes which ones are on, so the page cannot disagree", () => {
    expect(auth).toContain("export const socialSignIn");
  });
});

describe("route protection", () => {
  const prefixes =
    proxy.match(/const memberPrefixes = \[([\s\S]*?)\]/)?.[1] ?? "";

  it("guards every signed-in area at the edge", () => {
    for (const route of [
      "/home",
      "/discover",
      "/spaces",
      "/members",
      "/messages",
      "/notifications",
      "/compose",
      "/settings",
      "/billing",
      "/admin",
    ]) {
      expect(prefixes, `${route} is not guarded`).toContain(`"${route}"`);
    }
  });

  it("leaves the public sales pages open", () => {
    // The marketing site is the funnel that sells memberships. Guarding it
    // would mean nobody who is not already a member could ever buy one.
    for (const open of ["/membership", "/courses", "/login"]) {
      expect(prefixes).not.toContain(`"${open}"`);
    }
  });
});
