export function slugifyHandle(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return base.length >= 2 ? base : "member";
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@[a-z0-9_]{2,32}/gi) ?? [];
  return [...new Set(matches.map((match) => match.slice(1).toLowerCase()))];
}

export type FeedCursor = {
  publishedAt: Date;
  id: string;
};

export function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(`${publishedAt.toISOString()}::${id}`).toString(
    "base64url",
  );
}

export function decodeCursor(cursor: string): FeedCursor {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = raw.lastIndexOf("::");
  if (separator === -1) {
    throw new Error("Invalid cursor");
  }
  const iso = raw.slice(0, separator);
  const id = raw.slice(separator + 2);
  const publishedAt = new Date(iso);
  if (!id || Number.isNaN(publishedAt.getTime())) {
    throw new Error("Invalid cursor");
  }
  return { publishedAt, id };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
