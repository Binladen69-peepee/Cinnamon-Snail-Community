import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bunnyConfig,
  bunnyVideoState,
  embedToken,
  isBunnyVideoId,
  signedEmbedUrl,
  unsignedEmbedsAllowed,
  uploadSignature,
  uploadTicket,
  getBunnyVideo,
} from "@/lib/bunny/stream";
import { gateLesson, lessonHasMedia } from "@/lib/learn/access";

/**
 * Bunny Stream (DEC-081). What matters most is what this module refuses to
 * do: produce a playable URL without a signature where one is required, or
 * let a key out.
 */

const VIDEO = "3f0b5f9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ENV_KEYS = [
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_STREAM_TOKEN_KEY",
  "BUNNY_STREAM_ALLOW_UNSIGNED",
  "VERCEL_ENV",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.BUNNY_STREAM_LIBRARY_ID = "771634";
  process.env.BUNNY_STREAM_API_KEY = "test-api-key";
  delete process.env.BUNNY_STREAM_TOKEN_KEY;
  delete process.env.BUNNY_STREAM_ALLOW_UNSIGNED;
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("signatures", () => {
  it("signs an embed as sha256(token key + video id + expires)", () => {
    expect(embedToken("secret", VIDEO, 1_900_000_000)).toBe(sha256(`secret${VIDEO}1900000000`));
  });

  it("signs an upload as sha256(library + api key + expires + video id)", () => {
    expect(uploadSignature({ libraryId: "771634", apiKey: "k" }, VIDEO, 123)).toBe(
      sha256(`771634k123${VIDEO}`),
    );
  });

  it("gives a browser an upload ticket without the API key in it", () => {
    const ticket = uploadTicket(VIDEO, new Date("2026-10-06T00:00:00Z"));
    expect(ticket).not.toBeNull();
    expect(JSON.stringify(ticket)).not.toContain("test-api-key");
    expect(ticket!.expires).toBe(Math.floor(Date.parse("2026-10-06T00:00:00Z") / 1000) + 24 * 3600);
  });
});

describe("embed URLs", () => {
  it("signs every embed when the token key is set", () => {
    process.env.BUNNY_STREAM_TOKEN_KEY = "token-key";
    const now = new Date("2026-10-06T12:00:00Z");
    const embed = signedEmbedUrl(VIDEO, { now });
    expect(embed?.signed).toBe(true);
    const url = new URL(embed!.url);
    expect(url.origin).toBe("https://iframe.mediadelivery.net");
    expect(url.pathname).toBe(`/embed/771634/${VIDEO}`);
    const expires = Number(url.searchParams.get("expires"));
    expect(expires).toBe(Math.floor(now.getTime() / 1000) + 4 * 3600);
    expect(url.searchParams.get("token")).toBe(sha256(`token-key${VIDEO}${expires}`));
    // Neither secret ever appears in what the browser gets.
    expect(embed!.url).not.toContain("token-key");
    expect(embed!.url).not.toContain("test-api-key");
  });

  it("refuses to mint an unsigned embed by default", () => {
    expect(signedEmbedUrl(VIDEO)).toBeNull();
  });

  it("allows unsigned embeds only with the local testing flag", () => {
    process.env.BUNNY_STREAM_ALLOW_UNSIGNED = "1";
    expect(unsignedEmbedsAllowed()).toBe(true);
    const embed = signedEmbedUrl(VIDEO);
    expect(embed?.signed).toBe(false);
    expect(new URL(embed!.url).searchParams.has("token")).toBe(false);
  });

  it("never mints an unsigned embed in Vercel production, whatever the flag says", () => {
    process.env.BUNNY_STREAM_ALLOW_UNSIGNED = "1";
    process.env.VERCEL_ENV = "production";
    expect(unsignedEmbedsAllowed()).toBe(false);
    expect(signedEmbedUrl(VIDEO)).toBeNull();
  });

  it("refuses a malformed video id", () => {
    process.env.BUNNY_STREAM_TOKEN_KEY = "token-key";
    expect(signedEmbedUrl("../../etc/passwd")).toBeNull();
    expect(signedEmbedUrl("not-a-guid")).toBeNull();
    expect(isBunnyVideoId(VIDEO)).toBe(true);
    expect(isBunnyVideoId(`${VIDEO}?x=1`)).toBe(false);
  });

  it("does nothing without Bunny configured", () => {
    delete process.env.BUNNY_STREAM_API_KEY;
    expect(bunnyConfig()).toBeNull();
    expect(signedEmbedUrl(VIDEO)).toBeNull();
    expect(uploadTicket(VIDEO)).toBeNull();
  });
});

describe("status", () => {
  it("maps Bunny's numeric status", () => {
    expect(bunnyVideoState(4)).toBe("ready");
    expect(bunnyVideoState(5)).toBe("failed");
    expect(bunnyVideoState(6)).toBe("failed");
    expect(bunnyVideoState(0)).toBe("uploading");
    expect(bunnyVideoState(3)).toBe("processing");
    expect(bunnyVideoState(null)).toBe("processing");
  });

  it("reads a video from the API with the key in a header, never the URL", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).not.toContain("test-api-key");
      expect((init?.headers as Record<string, string>).AccessKey).toBe("test-api-key");
      return new Response(
        JSON.stringify({ guid: VIDEO, title: "Knife skills", length: 312.4, status: 4, encodeProgress: 100 }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getBunnyVideo(VIDEO);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe("ready");
      expect(result.value.length).toBe(312);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports a refused key without echoing it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    const result = await getBunnyVideo(VIDEO);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("test-api-key");
  });
});

describe("lesson gate", () => {
  const base = {
    published: true,
    isPreview: false,
    kind: "VIDEO",
    videoUid: null,
    audioUid: null,
    downloadUid: null,
    liveUrl: null,
    body: null,
  };

  it("counts a Bunny video as the lesson's video once links can be signed", () => {
    process.env.BUNNY_STREAM_TOKEN_KEY = "token-key";
    expect(lessonHasMedia({ ...base, bunnyVideoId: VIDEO })).toBe(true);
    expect(lessonHasMedia({ ...base, bunnyVideoId: null })).toBe(false);
    expect(lessonHasMedia({ ...base, videoUid: "abc123", bunnyVideoId: null })).toBe(true);
  });

  it("does not offer a Bunny-only lesson while no link can be signed", () => {
    // No token key and no unsigned flag: production until the key is added.
    expect(lessonHasMedia({ ...base, bunnyVideoId: VIDEO })).toBe(false);
    expect(gateLesson({ lesson: { ...base, bunnyVideoId: VIDEO }, membership: "active" }).state).toBe("unavailable");
    // A lesson that still has its older source keeps playing that.
    expect(lessonHasMedia({ ...base, videoUid: "abc123", bunnyVideoId: VIDEO })).toBe(true);
    // The local-testing flag never counts on Vercel production.
    process.env.BUNNY_STREAM_ALLOW_UNSIGNED = "1";
    process.env.VERCEL_ENV = "production";
    expect(lessonHasMedia({ ...base, bunnyVideoId: VIDEO })).toBe(false);
  });
});

describe("wiring", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("mints Bunny links only behind the lesson gate", () => {
    const route = read("app/api/learn/playback/[lessonId]/route.ts");
    const gateAt = route.indexOf("gateLesson(");
    const bunnyAt = route.indexOf("signedEmbedUrl(");
    expect(gateAt).toBeGreaterThan(-1);
    expect(bunnyAt).toBeGreaterThan(gateAt);
    expect(route).toContain("private, no-store");
  });

  it("keeps a lesson's older source playing until Bunny links can be signed", () => {
    const route = read("app/api/learn/playback/[lessonId]/route.ts");
    // No link minted and nothing older: no media. No link but an older
    // source: that source, through the same expiring app token as before.
    expect(route).toContain("lesson.bunnyVideoId && !embed && !lesson.videoUid)");
    expect(route.indexOf("if (embed)")).toBeGreaterThan(route.indexOf("signedEmbedUrl("));
    expect(route.indexOf("signPlaybackToken(")).toBeGreaterThan(route.indexOf("if (embed)"));
  });

  it("keeps the keys out of every client file", () => {
    for (const path of [
      "components/admin/bunny-video-field.tsx",
      "components/admin/bunny-library.tsx",
      "components/learn/use-bunny-progress.ts",
      "components/learn/lesson-player.tsx",
      "lib/bunny/tus-upload.ts",
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/BUNNY_STREAM_(API|TOKEN)_KEY\s*\]/);
      expect(source, path).not.toContain("process.env.BUNNY");
    }
  });

  it("only believes player messages from Bunny's player origin", () => {
    const bridge = read("components/learn/use-bunny-progress.ts");
    expect(bridge).toContain('event.origin !== BUNNY_PLAYER_ORIGIN');
    expect(bridge).toContain("event.source !== iframeRef.current?.contentWindow");
  });

  it("asks a player that is already ready to say so again, so resume cannot be missed", () => {
    const bridge = read("components/learn/use-bunny-progress.ts");
    expect(bridge).toContain('post("addEventListener", "ready")');
    // On mount, and every time the iframe (re)loads.
    expect(bridge).toContain('frame?.addEventListener("load", askReady)');
    expect(bridge).toMatch(/askReady\(\);\s*return \(\) => \{/);
  });
});
