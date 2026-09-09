import { describe, expect, it } from "vitest";
import { videoEmbedSrc } from "@/lib/community/media";
import { readPrivacy, visibleProfileFields } from "@/lib/community/privacy";

describe("video embeds", () => {
  it("embeds YouTube watch URLs", () => {
    expect(videoEmbedSrc("https://www.youtube.com/watch?v=dQw4w9wg")).toBe(
      "https://www.youtube.com/embed/dQw4w9wg",
    );
  });

  it("embeds youtu.be and Vimeo", () => {
    expect(videoEmbedSrc("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/embed/abc123",
    );
    expect(videoEmbedSrc("https://vimeo.com/123456")).toBe(
      "https://player.vimeo.com/video/123456",
    );
  });

  it("rejects unrelated URLs", () => {
    expect(videoEmbedSrc("https://example.com/video")).toBeNull();
  });
});

describe("profile privacy", () => {
  it("defaults to visible", () => {
    expect(readPrivacy(null)).toEqual({
      showLocation: true,
      showLinks: true,
      showInterests: true,
    });
  });

  it("hides fields for visitors but not the owner", () => {
    const hidden = readPrivacy({
      showLocation: false,
      showLinks: false,
      showInterests: false,
    });
    expect(visibleProfileFields(hidden, false).showLocation).toBe(false);
    expect(visibleProfileFields(hidden, true).showLocation).toBe(true);
  });
});
