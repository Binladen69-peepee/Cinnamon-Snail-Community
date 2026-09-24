import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  passwordProblems,
  passwordStrength,
  isPasswordStrong,
  type PasswordStrength,
} from "@/lib/auth/password-policy";
