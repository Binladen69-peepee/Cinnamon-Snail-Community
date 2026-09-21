import { youTubeEmbed, youTubeId, youTubeThumbnail } from "@/lib/marketing/teasers";

/**
 * iframe src for a linked video, or null when the URL is a plain media file
 * that `<video>` should play instead.
 */
export function videoEmbedSrc(url: string): string | null {
  const youtube = youTubeEmbed(url);
  if (youtube) return youtube;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Still to show before play: explicit thumbnail, else a YouTube frame. */
export function videoPosterUrl(
  url: string,
  thumbnailUrl?: string | null,
): string | null {
  if (thumbnailUrl) return thumbnailUrl;
  if (youTubeId(url)) return youTubeThumbnail(url);
  return null;
}
