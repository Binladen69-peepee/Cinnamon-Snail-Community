import { describe, expect, it } from "vitest";
import { lessonSummary } from "@/lib/admin/courses";

const lesson = (over: Partial<Parameters<typeof lessonSummary>[0]> = {}) => ({
  kind: "video",
  body: null,
  videoUid: null,
  _count: { resources: 0 },
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

  it("includes attachments and pluralises them", () => {
    expect(lessonSummary(lesson({ body: "copy", _count: { resources: 1 } }))).toBe(
      "2 Text & Images & 1 File",
    );
    expect(lessonSummary(lesson({ body: "copy", _count: { resources: 3 } }))).toBe(
      "2 Text & Images & 3 Files",
    );
  });

  it("says Empty rather than inventing a part count", () => {
    // A lesson with nothing in it is exactly what the Draft badge marks.
    expect(lessonSummary(lesson())).toBe("Empty");
  });
});
