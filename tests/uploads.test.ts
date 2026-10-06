import { describe, expect, it } from "vitest";
import {
  ACCEPT,
  GIF_ACCEPT,
  GIF_MAX_BYTES,
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  IMAGE_SOURCE_MAX_BYTES,
  MEDIA_ROUTE,
  VIDEO_MAX_BYTES,
  isAnimatedMedia,
  kindOf,
  objectKey,
  validateSource,
  validateUpload,
} from "@/lib/uploads/policy";
import {
  gifFrameCount,
  isAnimatedImage,
  sniffImageType,
} from "@/lib/uploads/animation";
import { objectPathFromUrl } from "@/lib/uploads/storage";

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

  it("carries 64 random bits from the CSPRNG after the timestamp", () => {
    const key = objectKey("user_abc123", "gif");
    expect(key).toMatch(/^user_abc123\/[0-9a-z]+-[0-9a-f]{16}\.gif$/);
  });
});

/* -------------------------------------------------------------------------- */
/* GIFs and other images that move                                            */
/* -------------------------------------------------------------------------- */

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const u32be = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
const u32le = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  (value >>> 24) & 255,
];

/** A real, minimal GIF89a: 1x1, a two-colour table, and `frames` frames. */
function gif(frames: number, { loop = true } = {}) {
  const bytes = [
    ...ascii("GIF89a"),
    1, 0, 1, 0, // 1x1 logical screen
    0x80, 0, 0, // a global colour table of 2 entries follows
    0, 0, 0, 255, 255, 255,
  ];
  if (loop) {
    // NETSCAPE2.0 application extension: loop forever.
    bytes.push(0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00);
  }
  for (let i = 0; i < frames; i += 1) {
    bytes.push(0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00); // graphic control, 100ms
    bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00); // image descriptor, no local table
    bytes.push(0x02, 0x02, 0x44, 0x01, 0x00); // LZW size 2, one data sub-block, terminator
  }
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

/** A PNG's chunk layout (CRCs are not read, so zeroes stand in). */
function png(chunks: string[]) {
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const type of chunks) {
    const data = type === "IHDR" ? 13 : type === "acTL" ? 8 : 4;
    bytes.push(...u32be(data), ...ascii(type), ...new Array<number>(data).fill(0), 0, 0, 0, 0);
  }
  return new Uint8Array(bytes);
}

/** A WebP's RIFF layout: the chunks given, with the VP8X flags byte when present. */
function webp(chunks: { fourcc: string; flags?: number; size?: number }[]) {
  const body: number[] = [...ascii("WEBP")];
  for (const chunk of chunks) {
    const size = chunk.size ?? 10;
    const data = new Array<number>(size).fill(0);
    if (chunk.flags !== undefined) data[0] = chunk.flags;
    body.push(...ascii(chunk.fourcc), ...u32le(size), ...data);
    if (size % 2 === 1) body.push(0);
  }
  return new Uint8Array([...ascii("RIFF"), ...u32le(body.length), ...body]);
}

describe("telling animated images from stills", () => {
  it("recognises formats by their bytes, not their names", () => {
    expect(sniffImageType(gif(1))).toBe("image/gif");
    expect(sniffImageType(png(["IHDR", "IDAT"]))).toBe("image/png");
    expect(sniffImageType(webp([{ fourcc: "VP8 " }]))).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array(ascii("<svg onload=alert(1)>")))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it("counts a GIF's frames by walking its blocks", () => {
    expect(gifFrameCount(gif(1))).toBe(1);
    expect(gifFrameCount(gif(3))).toBe(3);
    expect(gifFrameCount(gif(3, { loop: false }))).toBe(3);
    expect(isAnimatedImage(gif(2))).toBe(true);
    expect(isAnimatedImage(gif(1))).toBe(false);
  });

  it("stops at the end of a truncated GIF instead of reading past it", () => {
    const whole = gif(4);
    expect(gifFrameCount(whole.slice(0, whole.length - 20))).toBeGreaterThanOrEqual(2);
    expect(gifFrameCount(whole.slice(0, 20))).toBe(0);
  });

  it("finds an animated PNG's acTL before its first IDAT", () => {
    expect(isAnimatedImage(png(["IHDR", "acTL", "IDAT", "IEND"]))).toBe(true);
    expect(isAnimatedImage(png(["IHDR", "IDAT", "IEND"]))).toBe(false);
    // An acTL after the image data does not make an animation.
    expect(isAnimatedImage(png(["IHDR", "IDAT", "acTL"]))).toBe(false);
  });

  it("reads an animated WebP's flag and chunks", () => {
    expect(
      isAnimatedImage(webp([{ fourcc: "VP8X", flags: 0x02 }, { fourcc: "ANIM", size: 6 }])),
    ).toBe(true);
    expect(isAnimatedImage(webp([{ fourcc: "VP8X", flags: 0x00 }, { fourcc: "ANMF" }]))).toBe(true);
    expect(isAnimatedImage(webp([{ fourcc: "VP8X", flags: 0x10 }, { fourcc: "VP8 " }]))).toBe(false);
    expect(isAnimatedImage(webp([{ fourcc: "VP8L", size: 5 }]))).toBe(false);
  });

  it("never calls a JPEG or random bytes animated", () => {
    expect(isAnimatedImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0]))).toBe(false);
    expect(isAnimatedImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]))).toBe(
      false,
    );
  });
});

describe("GIF upload policy", () => {
  it("takes GIFs from the photo picker and offers a GIF-only picker", () => {
    expect(IMAGE_ACCEPT).toContain("image/gif");
    expect(GIF_ACCEPT).toBe("image/gif");
    expect(kindOf("image/gif")).toBe("image");
  });

  it("holds a GIF to its own ceiling, and says what to use instead", () => {
    expect(GIF_MAX_BYTES).toBe(10 * MB);
    expect(validateUpload({ mimeType: "image/gif", size: GIF_MAX_BYTES }).ok).toBe(true);
    const tooBig = validateUpload({ mimeType: "image/gif", size: GIF_MAX_BYTES + 1 });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.error).toContain("GIFs must be under 10 MB");
      expect(tooBig.error).toContain("MP4");
    }
  });

  it("lets a large photo through to be shrunk, but not a large GIF", () => {
    // A still photo is re-encoded on the device; a GIF never is.
    expect(IMAGE_SOURCE_MAX_BYTES).toBe(40 * MB);
    expect(validateSource({ mimeType: "image/jpeg", size: 25 * MB }).ok).toBe(true);
    expect(validateSource({ mimeType: "image/png", size: 39 * MB }).ok).toBe(true);
    const huge = validateSource({ mimeType: "image/jpeg", size: 41 * MB });
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error).toContain("Photos must be under 40 MB");
    expect(validateSource({ mimeType: "image/gif", size: 25 * MB }).ok).toBe(false);
    expect(validateSource({ mimeType: "video/mp4", size: 60 * MB }).ok).toBe(false);
    expect(validateSource({ mimeType: "image/svg+xml", size: 1 }).ok).toBe(false);
    expect(validateSource({ mimeType: "image/jpeg", size: 0 }).ok).toBe(false);
  });

  it("still holds what is uploaded to the 10 MB image limit", () => {
    expect(validateUpload({ mimeType: "image/webp", size: 10 * MB + 1 }).ok).toBe(false);
  });

  it("is not fooled by property names or nonsense sizes", () => {
    expect(kindOf("toString")).toBeNull();
    expect(kindOf("constructor")).toBeNull();
    expect(validateUpload({ mimeType: "__proto__", size: 1 }).ok).toBe(false);
    expect(validateUpload({ mimeType: "image/png", size: Number.NaN }).ok).toBe(false);
  });
});

describe("recognising a stored GIF", () => {
  it("knows a GIF by kind, type or file name", () => {
    expect(isAnimatedMedia({ kind: "gif", url: "/x" })).toBe(true);
    expect(isAnimatedMedia({ kind: "image", mimeType: "IMAGE/GIF", url: "/x" })).toBe(true);
    expect(isAnimatedMedia({ kind: "image", url: `${MEDIA_ROUTE}/u1/abc-123.gif` })).toBe(true);
    expect(isAnimatedMedia({ url: "https://media.tenor.com/x/cat.GIF?width=200" })).toBe(true);
  });

  it("does not mistake other files for one", () => {
    expect(isAnimatedMedia({ kind: "image", url: `${MEDIA_ROUTE}/u1/abc.webp` })).toBe(false);
    expect(isAnimatedMedia({ kind: "video", url: `${MEDIA_ROUTE}/u1/abc.mp4` })).toBe(false);
    expect(isAnimatedMedia({ url: "https://example.com/clip.gifv" })).toBe(false);
    expect(isAnimatedMedia({ url: "https://example.com/gif/photo.jpg" })).toBe(false);
  });

  it("reads our own media route back to an object key", () => {
    expect(MEDIA_ROUTE).toBe("/api/media");
    expect(objectPathFromUrl(`${MEDIA_ROUTE}/user1/k-1.gif`)).toBe("user1/k-1.gif");
    expect(objectPathFromUrl(`${MEDIA_ROUTE}/user1/../other/k.gif`)).toBeNull();
  });
});
