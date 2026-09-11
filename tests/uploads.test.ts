import { describe, expect, it } from "vitest";
import {
  ACCEPT,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  kindOf,
  objectKey,
  validateUpload,
} from "@/lib/uploads/policy";

const MB = 1024 * 1024;

describe("upload policy", () => {
  it("allows exactly the agreed image types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      const result = validateUpload({ mimeType: type, size: 1 * MB });
      expect(result.ok, type).toBe(true);
    }
  });

  it("allows exactly the agreed video types", () => {
    for (const type of ["video/mp4", "video/quicktime"]) {
      const result = validateUpload({ mimeType: type, size: 20 * MB });
      expect(result.ok, type).toBe(true);
    }
  });

  it("refuses anything not on the allowlist", () => {
    // SVG in particular: it is an image to a browser and a script host to an
    // attacker, which is why it is not on the list.
    for (const type of [
      "image/svg+xml",
      "text/html",
      "application/pdf",
      "video/x-msvideo",
      "application/zip",
      "",
    ]) {
      const result = validateUpload({ mimeType: type, size: 1 * MB });
      expect(result.ok, type).toBe(false);
    }
  });

  it("caps images at 10MB and videos at the project ceiling of 50MB", () => {
    expect(IMAGE_MAX_BYTES).toBe(10 * MB);
    // 50, not the 100 originally agreed: the Supabase project refuses a bucket
    // limit above 50MB on the current plan, so anything higher here would be a
    // promise storage breaks. These two must not drift apart.
    expect(VIDEO_MAX_BYTES).toBe(50 * MB);

    expect(validateUpload({ mimeType: "image/png", size: 10 * MB }).ok).toBe(true);
    expect(validateUpload({ mimeType: "image/png", size: 10 * MB + 1 }).ok).toBe(false);
    expect(validateUpload({ mimeType: "video/mp4", size: 50 * MB }).ok).toBe(true);
    expect(validateUpload({ mimeType: "video/mp4", size: 50 * MB + 1 }).ok).toBe(false);
  });

  it("does not let a video-sized image through on the video limit", () => {
    // The limit is chosen by the resolved kind, not by whichever is larger.
    const result = validateUpload({ mimeType: "image/jpeg", size: 50 * MB });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Images");
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ mimeType: "image/png", size: 0 }).ok).toBe(false);
  });

  it("resolves the extension from the declared type, not a filename", () => {
    const result = validateUpload({ mimeType: "image/webp", size: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ext).toBe("webp");
      expect(result.kind).toBe("image");
    }
  });

  it("classifies kinds", () => {
    expect(kindOf("image/gif")).toBe("image");
    expect(kindOf("video/quicktime")).toBe("video");
    expect(kindOf("image/svg+xml")).toBe(null);
  });

  it("offers only allowed types to the file picker", () => {
    expect(ACCEPT).toContain("image/jpeg");
    expect(ACCEPT).toContain("video/mp4");
    expect(ACCEPT).not.toContain("svg");
  });
});

describe("object keys", () => {
  it("always lands under the member's own id, which is what RLS matches", () => {
    const key = objectKey("user_abc123", "webp");
    expect(key.startsWith("user_abc123/")).toBe(true);
    expect(key.endsWith(".webp")).toBe(true);
    // Exactly one level deep: the policy matches on the first path segment.
    expect(key.split("/")).toHaveLength(2);
  });

  it("is unguessable, so a public bucket cannot be enumerated by user id", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => objectKey("user_abc123", "jpg")),
    );
    expect(keys.size).toBe(50);
  });
});
