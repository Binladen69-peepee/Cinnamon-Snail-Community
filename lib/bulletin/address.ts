import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * A gathering's exact address, encrypted at rest (BUILD.md §19, "Privacy").
 *
 * AES-256-GCM, with the key derived from `AUTH_SECRET` by HKDF under a label
 * of its own, so this key is never the session key and rotating one does not
 * silently reuse the other. The stored form is versioned so the scheme can
 * change without guessing what an old row is.
 *
 * The plaintext only ever leaves this module for the host and for guests the
 * host approved; it never goes in a URL, a query string, an email subject or
 * an export.
 */

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is required to store gathering addresses.");
    }
    return Buffer.from(hkdfSync("sha256", "local-dev-only", "", "vu-happening-address", 32));
  }
  return Buffer.from(hkdfSync("sha256", secret, "", "vu-happening-address", 32));
}

export function encryptAddress(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(":");
}

/** Null when the value is missing, from an unknown version, or tampered with. */
export function decryptAddress(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [version, iv, tag, body] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
