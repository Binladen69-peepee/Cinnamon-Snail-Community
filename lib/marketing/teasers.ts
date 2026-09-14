/**
 * Teaser video links.
 *
 * The client's class spreadsheet supplies teasers as YouTube URLs, which a
 * `<video>` element cannot play — it wants a media file, and a YouTube page is
 * an HTML document. So a teaser has to be resolved to an iframe embed before a
 * player can show it, and anything that is not YouTube (a self-hosted mp4 in
 * Supabase, say) has to fall through to `<video>` untouched.
 *
 * Everything here is pure string work so it can run in a server component, in
 * the import script, and under vitest without a DOM.
 */

/** YouTube ids are exactly 11 chars of the URL-safe base64 alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

/**
 * The video id inside any common YouTube URL shape, or null if this is not a
 * YouTube link at all.
 *
 * Handles the four forms that actually turn up: `/embed/ID`, `/watch?v=ID`,
 * the `youtu.be/ID` short link, and `/shorts/ID`.
 */
export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);

  // youtu.be/ID — the id is the whole path.
  if (parsed.hostname.toLowerCase().endsWith("youtu.be")) {
    const id = segments[0];
    return id && VIDEO_ID.test(id) ? id : null;
  }

  // /watch?v=ID
  if (segments[0] === "watch") {
    const id = parsed.searchParams.get("v");
    return id && VIDEO_ID.test(id) ? id : null;
  }

  // /embed/ID, /shorts/ID, /v/ID and /live/ID all put the id second.
  if (["embed", "shorts", "v", "live"].includes(segments[0] ?? "")) {
    const id = segments[1];
    return id && VIDEO_ID.test(id) ? id : null;
  }

  return null;
}

/**
 * The canonical embed URL for a teaser, or null when the link is not YouTube
 * and should be handed to a plain `<video>` instead.
 *
 * Returned without a query string so callers can append their own player
 * parameters; `youtube-nocookie.com` because the sales pages embed these to
 * visitors who have not agreed to anything yet.
 */
export function youTubeEmbed(url: string | null | undefined): string | null {
  const id = youTubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/**
 * A YouTube thumbnail for a teaser. Useful as a last-resort dish photo when a
 * class has a teaser but no still — though the client's own photography is
 * always preferred, so nothing calls this automatically.
 */
export function youTubeThumbnail(url: string | null | undefined): string | null {
  const id = youTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : null;
}
