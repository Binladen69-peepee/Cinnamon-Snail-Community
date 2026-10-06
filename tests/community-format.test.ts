import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  normalizeEmail,
  slugifyHandle,
} from "@/lib/community/format";
import { parseMentions } from "@/lib/community/mentions";

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

  it("does not read an email address as a mention", () => {
    // The old regex notified @bob for this, and anyone else whose handle was
    // the domain of an address someone typed.
    expect(parseMentions("write to a@bob.com about it")).toEqual([]);
    expect(parseMentions("a@bob.com, cc @sam")).toEqual(["sam"]);
  });

  it("does not read code or a link's address as a mention", () => {
    expect(parseMentions("type `@sam` in the box")).toEqual([]);
    expect(parseMentions("```\nnpm i @scope/pkg\n```")).toEqual([]);
    expect(parseMentions("see https://example.com/@sam for more")).toEqual([]);
  });

  it("agrees with the rendering about who was mentioned", () => {
    // A hand-written member link counts; the same handle twice is one mention.
    expect(parseMentions("[@sam](/members/sam) and @priya, then @sam again")).toEqual([
      "sam",
      "priya",
    ]);
    expect(parseMentions("")).toEqual([]);
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
