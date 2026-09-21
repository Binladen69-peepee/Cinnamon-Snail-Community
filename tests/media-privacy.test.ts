import { describe, expect, it } from "vitest";
import { videoEmbedSrc } from "@/lib/community/media";
import { readPrivacy, visibleProfileFields } from "@/lib/community/privacy";

describe("video embeds", () => {
  it("embeds YouTube watch URLs", () => {
    expect(videoEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("embeds youtu.be, /embed/, and Vimeo", () => {
    expect(videoEmbedSrc("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedSrc("https://www.youtube.com/embed/GuhyvG7W48c")).toBe(
      "https://www.youtube-nocookie.com/embed/GuhyvG7W48c",
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
