import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblems,
  passwordStrength,
} from "@/lib/auth/password-policy";

/**
 * The password rules, which the register form, the reset form and the settings
 * form all run. They are pure so all three can share them; these tests are
 * what stop one of them quietly relaxing.
 */

describe("passwordProblems", () => {
  it("accepts an ordinary long password", () => {
    expect(passwordProblems("clementine harbour 14")).toEqual([]);
  });

  it("rejects anything shorter than the minimum", () => {
    const problems = passwordProblems("a".repeat(PASSWORD_MIN_LENGTH - 1));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("rejects past the bcrypt truncation point", () => {
    // bcrypt ignores everything after 72 bytes, so accepting more would store
    // less of the secret than the person believes.
    const problems = passwordProblems("x9Q!".repeat(30));
    expect(problems.join(" ")).toContain(String(PASSWORD_MAX_LENGTH));
  });

  it("rejects the passwords everyone guesses first", () => {
    expect(passwordProblems("password123")).not.toEqual([]);
    expect(passwordProblems("veganuniversity")).not.toEqual([]);
  });

  it("rejects one character held down", () => {
    expect(passwordProblems("aaaaaaaaaaaa")).not.toEqual([]);
  });

  it("rejects a password built from the person's own email or name", () => {
    expect(
      passwordProblems("hazelnut2026", { email: "hazelnut@example.com" }),
    ).not.toEqual([]);
    // A name that merely shares letters is fine; only containment is caught.
    expect(passwordProblems("riverbed lantern", { name: "Sam Rivera" })).toEqual(
      [],
    );
    expect(passwordProblems("samrivera-99", { name: "samrivera" })).not.toEqual(
      [],
    );
  });

  it("says nothing about an empty password beyond its length", () => {
    // An empty field is a required-field problem, not a repeated-character one.
    expect(passwordProblems("")).toHaveLength(1);
  });
});

describe("passwordStrength", () => {
  it("scores zero below the minimum", () => {
    expect(passwordStrength("short").score).toBe(0);
    expect(passwordStrength("short").label).toBe("Too short");
  });

  it("rewards length above variety", () => {
    const longSimple = passwordStrength("abcdefghijklmnopqrstu");
    const shortComplex = passwordStrength("aB3!aB3!aB");
    expect(longSimple.score).toBeGreaterThanOrEqual(shortComplex.score);
  });

  it("never rates a top-of-the-corpus password above weak", () => {
    expect(passwordStrength("password123").score).toBe(1);
  });

  it("stays inside its own scale", () => {
    for (const candidate of ["", "a", "a".repeat(40), "Tr0ub4dor&3xxxxxxxxx"]) {
      const { score } = passwordStrength(candidate);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});
