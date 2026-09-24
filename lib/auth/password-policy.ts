/**
 * The password rules, and nothing else.
 *
 * Separate from `password.ts` because that module imports bcrypt, and the
 * register form needs these rules in the browser. Importing bcrypt into a
 * client bundle to ask how long a string is would be absurd. Everything here
 * is pure, so the form and the server run identical checks.
 */
export const PASSWORD_MIN_LENGTH = 10;
/**
 * bcrypt silently truncates at 72 bytes, so anything past that is not part of
 * the secret. Refusing it is honest; accepting it pretends to store more.
 */
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Passwords that sit at the top of every breach corpus. This is not a
 * substitute for a real breached-password service, but it costs nothing and
 * stops the handful of guesses an online attacker would actually try first.
 */
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "iloveyou1",
  "welcome123",
  "admin12345",
  "veganuniversity",
  "vegan12345",
]);

/**
 * Every reason this password cannot be used, in the order a person should fix
 * them. An empty array means it is acceptable.
 *
 * Deliberately pure and free of imports so the register form can run the
 * identical check while someone types. The server runs it again before
 * hashing: the client copy is a courtesy, never the gate.
 */
export function passwordProblems(
  password: string,
  context: { email?: string; name?: string } = {},
): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Keep it under ${PASSWORD_MAX_LENGTH} characters.`);
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) {
    problems.push("That password is one of the most guessed. Pick another.");
  }
  if (password.length > 0 && /^(.)\1+$/.test(password)) {
    problems.push("One repeated character is not a password.");
  }
  const local = context.email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && lower.includes(local)) {
    problems.push("Leave your email address out of your password.");
  }
  const name = context.name?.trim().toLowerCase() ?? "";
  if (name.length >= 3 && lower.includes(name)) {
    problems.push("Leave your name out of your password.");
  }
  return problems;
}

export type PasswordStrength = {
  /** 0 to 4. */
  score: number;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
};

/**
 * A meter, not a gate. It rewards length first, because length is what
 * actually costs an attacker time, and character variety second.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { score: 0, label: "Too short" };
  }
  let score = 1;
  if (password.length >= 14) score += 1;
  if (password.length >= 20) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes >= 3) score += 1;
  if (COMMON.has(password.toLowerCase())) score = 1;
  score = Math.min(4, score);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
  return { score, label: labels[score] };
}

/** Back-compatible boolean form. */
export function isPasswordStrong(
  password: string,
  context: { email?: string; name?: string } = {},
): boolean {
  return passwordProblems(password, context).length === 0;
}
