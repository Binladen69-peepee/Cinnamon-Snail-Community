import { describe, expect, it } from "vitest";
import { gateLesson, lessonHasMedia } from "@/lib/learn/access";
import {
  formatChapterTime,
  lessonChapters,
  parseChapters,
} from "@/lib/learn/chapters";

/**
 * The gate, and the chapter list.
 *
 * Both are pure, and both sit directly in front of paid content: the gate is
 * what the course page, the player, the playback endpoint and the media route
 * all call, and the chapter list is the one place a hand-edited JSON column
 * reaches the browser.
 */

const lesson = (over: Partial<Parameters<typeof gateLesson>[0]["lesson"]> = {}) => ({
  published: true,
  isPreview: false,
  kind: "VIDEO",
  videoUid: "abc",
  audioUid: null,
  downloadUid: null,
  liveUrl: null,
  body: null,
  ...over,
});

describe("lessonHasMedia", () => {
  it("asks for the medium the lesson claims to be", () => {
    expect(lessonHasMedia(lesson())).toBe(true);
    expect(lessonHasMedia(lesson({ videoUid: null }))).toBe(false);
    // A video lesson with a body is still a video lesson with no video.
    expect(lessonHasMedia(lesson({ videoUid: null, body: "notes" }))).toBe(false);
    expect(lessonHasMedia(lesson({ kind: "TEXT", body: "Real words" }))).toBe(true);
    expect(lessonHasMedia(lesson({ kind: "TEXT", body: "  \n " }))).toBe(false);
    expect(
      lessonHasMedia(lesson({ kind: "LIVE", liveUrl: "https://zoom.example" })),
    ).toBe(true);
  });

  it("refuses a kind it has never heard of", () => {
    // A column that has drifted, or a row written by hand. Not "open".
    expect(lessonHasMedia(lesson({ kind: "HOLOGRAM" }))).toBe(false);
  });
});

describe("gateLesson", () => {
  it("opens a preview for anyone signed in", () => {
    expect(
      gateLesson({ lesson: lesson({ isPreview: true }), membership: "none" }),
    ).toEqual({ state: "open", reason: "preview" });
    expect(
      gateLesson({ lesson: lesson({ isPreview: true }), membership: "expired" }),
    ).toEqual({ state: "open", reason: "preview" });
  });

  it("opens the rest only for a live membership", () => {
    expect(gateLesson({ lesson: lesson(), membership: "active" })).toEqual({
      state: "open",
      reason: "member",
    });
    expect(gateLesson({ lesson: lesson(), membership: "none" })).toEqual({
      state: "locked",
      membership: "none",
    });
  });

  it("tells a lapsed member apart from someone who never joined", () => {
    // They need different sentences and different links, so the gate keeps
    // the distinction rather than collapsing both to "not entitled".
    const lapsed = gateLesson({ lesson: lesson(), membership: "expired" });
    expect(lapsed).toEqual({ state: "locked", membership: "expired" });
  });

  it("calls a draft unavailable rather than locked", () => {
    // "Locked" would invite a member to pay for something that does not exist.
    expect(
      gateLesson({ lesson: lesson({ published: false }), membership: "active" }),
    ).toEqual({ state: "unavailable", reason: "draft" });
  });

  it("calls a lesson with no media unavailable, even to a paying member", () => {
    expect(
      gateLesson({ lesson: lesson({ videoUid: null }), membership: "active" }),
    ).toEqual({ state: "unavailable", reason: "no-media" });
  });

  it("lets staff past membership but not past emptiness", () => {
    expect(
      gateLesson({
        lesson: lesson({ published: false }),
        membership: "none",
        isStaff: true,
      }),
    ).toEqual({ state: "open", reason: "member" });
    // Seeing a broken lesson as broken is the point of being able to see it.
    expect(
      gateLesson({
        lesson: lesson({ videoUid: null }),
        membership: "none",
        isStaff: true,
      }),
    ).toEqual({ state: "unavailable", reason: "no-media" });
  });
});

describe("lessonChapters", () => {
  it("drops anything that is not a usable marker", () => {
    expect(
      lessonChapters([
        { atSeconds: 0, title: "Start" },
        { atSeconds: -4, title: "Before the start" },
        { atSeconds: 10, title: "   " },
        { atSeconds: "nonsense", title: "Broken" },
        null,
        "not an object",
      ]),
    ).toEqual([{ atSeconds: 0, title: "Start" }]);
  });

  it("survives a column that is not an array at all", () => {
    expect(lessonChapters(null)).toEqual([]);
    expect(lessonChapters({ atSeconds: 0, title: "Start" })).toEqual([]);
    expect(lessonChapters("0:00 Start")).toEqual([]);
  });

  it("sorts, and never offers two markers at the same second", () => {
    // The player seeks by time; a duplicate is a button that does nothing.
    expect(
      lessonChapters([
        { atSeconds: 90, title: "Second" },
        { atSeconds: 0, title: "First" },
        { atSeconds: 90, title: "Second again" },
      ]),
    ).toEqual([
      { atSeconds: 0, title: "First" },
      { atSeconds: 90, title: "Second" },
    ]);
  });

  it("caps a runaway list", () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      atSeconds: index,
      title: `Chapter ${index}`,
    }));
    expect(lessonChapters(many)).toHaveLength(60);
  });
});

describe("parseChapters", () => {
  it("reads the three timestamp shapes people actually type", () => {
    expect(
      parseChapters("0:00 Mise en place\n4:30 The dough\n1:02:03 Folding\n95 Rest"),
    ).toEqual([
      { atSeconds: 0, title: "Mise en place" },
      { atSeconds: 95, title: "Rest" },
      { atSeconds: 270, title: "The dough" },
      { atSeconds: 3723, title: "Folding" },
    ]);
  });

  it("ignores blank lines and lines with no timestamp", () => {
    expect(parseChapters("\n\nJust a note\n0:10 Real\n")).toEqual([
      { atSeconds: 10, title: "Real" },
    ]);
  });
});

describe("formatChapterTime", () => {
  it("shows hours only once there are hours", () => {
    expect(formatChapterTime(0)).toBe("0:00");
    expect(formatChapterTime(95)).toBe("1:35");
    expect(formatChapterTime(3723)).toBe("1:02:03");
    expect(formatChapterTime(-5)).toBe("0:00");
  });
});
