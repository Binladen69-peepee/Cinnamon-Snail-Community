/**
 * What an image file really is, and whether it moves.
 *
 * The composer shrinks photos on the device by drawing them to a canvas
 * (`lib/uploads/client.ts`), and a canvas holds exactly one frame. That is
 * right for a photo and quietly destroys an animation: a GIF, an animated
 * WebP from a phone keyboard, or an animated PNG comes out the other side as
 * a still. So before anything is drawn, the first bytes of the file are read
 * and the format's own structure decides — never the file name, which is
 * often wrong (a GIF saved as `.jpg` is common).
 *
 * Pure functions over bytes, with no DOM and no Node APIs, so the browser and
 * the tests run the same code. Every walk is bounded by the buffer: a
 * truncated or hostile file ends the scan, it cannot loop or read past the end.
 */

export type SniffedImageType = "image/gif" | "image/png" | "image/webp" | "image/jpeg";

/** How much of a file to read before deciding. Animation markers sit early. */
export const SNIFF_BYTES = 512 * 1024;

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let i = from; i < to && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

function uint32BE(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) >>> 0) +
    (bytes[at + 1]! << 16) +
    (bytes[at + 2]! << 8) +
    bytes[at + 3]!
  );
}

function uint32LE(bytes: Uint8Array, at: number): number {
  return (
    bytes[at]! +
    (bytes[at + 1]! << 8) +
    (bytes[at + 2]! << 16) +
    ((bytes[at + 3]! << 24) >>> 0)
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The image format from its magic bytes, or null when it is none we accept. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 6) {
    const head = ascii(bytes, 0, 6);
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/** Skips a run of GIF data sub-blocks. Returns the index after the terminator, or -1 if the bytes ran out. */
function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let i = start;
  while (i < bytes.length) {
    const size = bytes[i]!;
    i += 1;
    if (size === 0) return i;
    i += size;
  }
  return -1;
}

/**
 * Frames in a GIF, counting no further than `stopAt`.
 *
 * Walks the block structure: header and screen descriptor, optional global
 * colour table, then extensions (0x21) and image descriptors (0x2C) until the
 * trailer (0x3B). Anything unexpected stops the walk rather than guessing.
 */
export function gifFrameCount(bytes: Uint8Array, stopAt = Number.POSITIVE_INFINITY): number {
  if (bytes.length < 13 || sniffImageType(bytes) !== "image/gif") return 0;
  let i = 13;
  const screenFlags = bytes[10]!;
  if (screenFlags & 0x80) i += 3 * (1 << ((screenFlags & 0x07) + 1));

  let frames = 0;
  while (i < bytes.length) {
    const block = bytes[i]!;
    if (block === 0x3b) break;
    if (block === 0x21) {
      // Introducer, label, then the extension's sub-blocks.
      i = skipSubBlocks(bytes, i + 2);
      if (i < 0) break;
      continue;
    }
    if (block === 0x2c) {
      frames += 1;
      if (frames >= stopAt) break;
      if (i + 10 > bytes.length) break;
      const imageFlags = bytes[i + 9]!;
      i += 10;
      if (imageFlags & 0x80) i += 3 * (1 << ((imageFlags & 0x07) + 1));
      // LZW minimum code size, then the image data sub-blocks.
      i = skipSubBlocks(bytes, i + 1);
      if (i < 0) break;
      continue;
    }
    break;
  }
  return frames;
}

/** An APNG declares itself with an `acTL` chunk, which must precede the first `IDAT`. */
function pngIsAnimated(bytes: Uint8Array): boolean {
  let i = 8;
  while (i + 8 <= bytes.length) {
    const length = uint32BE(bytes, i);
    const type = ascii(bytes, i + 4, i + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    i += 12 + length;
  }
  return false;
}

/**
 * An animated WebP is an extended file (`VP8X`) with the animation flag set,
 * followed by `ANIM`/`ANMF` chunks. A still one is a bare `VP8 `/`VP8L`
 * bitstream, or `VP8X` without the flag.
 */
function webpIsAnimated(bytes: Uint8Array): boolean {
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = ascii(bytes, i, i + 4);
    const size = uint32LE(bytes, i + 4);
    if (fourcc === "VP8X") {
      if (i + 8 < bytes.length && (bytes[i + 8]! & 0x02) !== 0) return true;
    } else if (fourcc === "ANIM" || fourcc === "ANMF") {
      return true;
    } else if (fourcc === "VP8 " || fourcc === "VP8L") {
      return false;
    }
    // Chunks are padded to an even length.
    i += 8 + size + (size & 1);
  }
  return false;
}

/**
 * Whether the image has more than one frame.
 *
 * Reads only the bytes given (the first `SNIFF_BYTES` of a file is plenty:
 * every format puts its animation marker before the pixel data). A GIF whose
 * first frame is larger than the slice cannot be proved animated, which is
 * why callers pass GIFs through untouched regardless.
 */
export function isAnimatedImage(bytes: Uint8Array): boolean {
  switch (sniffImageType(bytes)) {
    case "image/gif":
      return gifFrameCount(bytes, 2) >= 2;
    case "image/png":
      return pngIsAnimated(bytes);
    case "image/webp":
      return webpIsAnimated(bytes);
    default:
      return false;
  }
}
