import { describe, expect, it } from "vitest";
import { signPlaybackToken, verifyPlaybackToken } from "@/lib/learn/playback";
import { coursePercent } from "@/lib/learn/progress";

describe("lesson playback tokens", () => {
  it("signs an expiring token bound to lesson and member", () => {
    const token = signPlaybackToken({
      lessonId: "lesson-1",
      userId: "user-1",
      now: new Date("2026-09-09T12:00:00.000Z"),
    });
    const payload = verifyPlaybackToken(token, new Date("2026-09-09T12:01:00.000Z"));
    expect(payload).toEqual(
      expect.objectContaining({ lessonId: "lesson-1", userId: "user-1" }),
    );
  });

  it("rejects a tampered token", () => {
    const token = signPlaybackToken({ lessonId: "lesson-1", userId: "user-1" });
    expect(verifyPlaybackToken(`${token}x`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signPlaybackToken({
      lessonId: "lesson-1",
      userId: "user-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(verifyPlaybackToken(token, new Date("2026-09-09T00:00:00.000Z"))).toBeNull();
  });
});

describe("course progress", () => {
  it("computes percent from completed lessons", () => {
    expect(coursePercent(2, 5)).toBe(40);
    expect(coursePercent(0, 4)).toBe(0);
    expect(coursePercent(3, 0)).toBe(0);
  });
});
