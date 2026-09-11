import { IMAGE_TYPES, kindOf } from "@/lib/uploads/policy";

/** Longest edge we keep. A feed image is never displayed wider than this. */
const MAX_EDGE = 2000;
const WEBP_QUALITY = 0.82;

export type PreparedFile = {
  blob: Blob;
  mimeType: string;
  width: number | null;
  height: number | null;
};

/**
 * Read an image's natural size without decoding it into the page.
 */
function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

/**
 * Read a video's dimensions from its metadata, so the feed can reserve the
 * right space before the file loads.
 */
function videoSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      // Not fatal: a video without known dimensions just gets a default ratio.
      resolve({ width: 0, height: 0 });
    };
    video.src = url;
  });
}

/**
 * Shrink and re-encode an image before it leaves the device.
 *
 * A 6 MB phone photo becomes a few hundred KB, which makes the upload roughly
 * twenty times shorter and makes the image twenty times cheaper for every
 * member who scrolls past it later. This is the single biggest thing that makes
 * posting a photo feel fast.
 *
 * GIFs pass through untouched — drawing one to a canvas would keep the first
 * frame and throw the animation away. Video passes through too; re-encoding
 * that in a browser tab is not worth the cost.
 */
export async function prepareForUpload(file: File): Promise<PreparedFile> {
  const kind = kindOf(file.type);

  if (kind === "video") {
    const size = await videoSize(file);
    return {
      blob: file,
      mimeType: file.type,
      width: size.width || null,
      height: size.height || null,
    };
  }

  if (!(file.type in IMAGE_TYPES) || file.type === "image/gif") {
    const size = await imageSize(file).catch(() => ({ width: 0, height: 0 }));
    return {
      blob: file,
      mimeType: file.type,
      width: size.width || null,
      height: size.height || null,
    };
  }

  const source = await imageSize(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return { blob: file, mimeType: file.type, width: source.width, height: source.height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return { blob: file, mimeType: file.type, width: source.width, height: source.height };
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/webp", WEBP_QUALITY);
  });

  // If WebP is unavailable, or re-encoding made it bigger, keep the original.
  if (!blob || blob.size >= file.size) {
    return { blob: file, mimeType: file.type, width: source.width, height: source.height };
  }

  return { blob, mimeType: "image/webp", width, height };
}

/**
 * PUT the bytes with real progress.
 *
 * XHR rather than fetch: fetch still cannot report upload progress, and a
 * progress bar that only knows "started" and "finished" is what makes a large
 * upload feel broken.
 */
export function putWithProgress(input: {
  url: string;
  blob: Blob;
  mimeType: string;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", input.url);
    request.setRequestHeader("content-type", input.mimeType);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress(event.loaded / event.total);
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        input.onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${request.status}).`));
      }
    };
    request.onerror = () => reject(new Error("Upload failed. Check your connection."));
    request.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    input.signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(input.blob);
  });
}
