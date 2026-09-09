import { createHash } from "crypto";

export type MagicTokenStatus = "valid" | "invalid" | "expired" | "used";

export type StoredMagicToken = {
  expires: Date;
  usedAt: Date | null;
};

export function hashMagicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inspectStoredToken(
  record: StoredMagicToken | null,
  now = new Date(),
): MagicTokenStatus {
  if (!record) return "invalid";
  if (record.usedAt) return "used";
  if (record.expires <= now) return "expired";
  return "valid";
}

export function isRedirectAuthError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "(invalid)";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}
