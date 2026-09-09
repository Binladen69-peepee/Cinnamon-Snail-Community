import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  normalizeEmail,
  parseMentions,
  slugifyHandle,
} from "@/lib/community/format";

describe("handles and mentions", () => {
  it("slugifies handles", () => {
    expect(slugifyHandle("Sam Member")).toBe("sammember");
    expect(slugifyHandle("!!!")).toBe("member");
  });

  it("parses unique mentions", () => {
    expect(parseMentions("hey @Adam and @adam and @sam_1")).toEqual([
      "adam",
      "sam_1",
    ]);
  });

  it("normalizes email", () => {
    expect(normalizeEmail("  Ada@Kitchen.COM ")).toBe("ada@kitchen.com");
  });
});

describe("feed cursors", () => {
  it("round-trips", () => {
    const date = new Date("2026-09-08T12:00:00.000Z");
    const cursor = encodeCursor(date, "post_1");
    expect(decodeCursor(cursor)).toEqual({ publishedAt: date, id: "post_1" });
  });

  it("rejects invalid cursors", () => {
    expect(() => decodeCursor("nope")).toThrow();
  });
});
