import { describe, expect, it } from "vitest";
import { lessonIsReady, lessonSummary } from "@/lib/admin/courses";

const lesson = (
  over: Partial<Parameters<typeof lessonSummary>[0]> = {},
): Parameters<typeof lessonSummary>[0] => ({
  kind: "VIDEO",
  body: null,
  videoUid: null,
  audioUid: null,
  downloadUid: null,
  liveUrl: null,
  resources: [],
  ...over,
});

describe("lessonSummary", () => {
  it("counts a text lesson the way the design reads", () => {
    expect(lessonSummary(lesson({ body: "Some copy" }))).toBe("1 Text & Images");
  });

  it("names a video lesson as a video", () => {
    expect(lessonSummary(lesson({ videoUid: "abc123" }))).toBe("1 Video");
  });

  it("counts the parts, not the lessons", () => {
    expect(lessonSummary(lesson({ videoUid: "abc", body: "copy" }))).toBe(
      "2 Video & Text & Images",
    );
  });

  it("names the other kinds of media too", () => {
    expect(lessonSummary(lesson({ kind: "AUDIO", audioUid: "abc" }))).toBe(
      "1 Audio",
    );
    expect(
      lessonSummary(lesson({ kind: "DOWNLOAD", downloadUid: "abc" })),
    ).toBe("1 Download");
    expect(
      lessonSummary(lesson({ kind: "LIVE", liveUrl: "https://zoom.example" })),
    ).toBe("1 Live");
  });

  it("includes attachments and pluralises them", () => {
    expect(
      lessonSummary(lesson({ body: "copy", resources: [{ id: "a" }] })),
    ).toBe("2 Text & Images & 1 File");
    expect(
      lessonSummary(
        lesson({
          body: "copy",
          resources: [{ id: "a" }, { id: "b" }, { id: "c" }],
        }),
      ),
    ).toBe("2 Text & Images & 3 Files");
  });

  it("says Empty rather than inventing a part count", () => {
    // A lesson with nothing in it is exactly what the Draft badge marks.
    expect(lessonSummary(lesson())).toBe("Empty");
  });
});

describe("lessonIsReady", () => {
  it("wants the medium the lesson claims to be, not any medium", () => {
    // A video lesson carrying only a body is a video lesson with no video.
    expect(lessonIsReady(lesson({ kind: "VIDEO", body: "copy" }))).toBe(false);
    expect(lessonIsReady(lesson({ kind: "VIDEO", videoUid: "abc" }))).toBe(true);
    expect(lessonIsReady(lesson({ kind: "AUDIO", videoUid: "abc" }))).toBe(false);
    expect(lessonIsReady(lesson({ kind: "AUDIO", audioUid: "abc" }))).toBe(true);
    expect(
      lessonIsReady(lesson({ kind: "DOWNLOAD", downloadUid: "abc" })),
    ).toBe(true);
    expect(
      lessonIsReady(lesson({ kind: "LIVE", liveUrl: "https://zoom.example" })),
    ).toBe(true);
  });

  it("treats whitespace as no body at all", () => {
    expect(lessonIsReady(lesson({ kind: "TEXT", body: "   \n " }))).toBe(false);
    expect(lessonIsReady(lesson({ kind: "TEXT", body: "Real words" }))).toBe(true);
    expect(lessonIsReady(lesson({ kind: "QUIZ", body: "A question?" }))).toBe(
      true,
    );
  });
});
