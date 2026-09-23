import { describe, expect, it } from "vitest";
import {
  COMPOSER_TYPES,
  describeIncomplete,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  parseComposerType,
  typeHasField,
} from "@/lib/community/post-types";

const type = (value: string) =>
  COMPOSER_TYPES.find((option) => option.value === value)!;

const form = (over: Partial<Parameters<typeof describeIncomplete>[0]> = {}) => ({
  type: type("SIMPLE"),
  title: "",
  body: "",
  link: "",
  pollOptions: [] as string[],
  attachments: 0,
  spaceId: "space-1",
  ...over,
});

describe("parseComposerType", () => {
  it("reads the type the inline composer links with", () => {
    // The inline box has always linked to /compose?type=POLL and ?type=LINK.
    expect(parseComposerType("POLL").value).toBe("POLL");
    expect(parseComposerType("LINK").value).toBe("LINK");
  });

  it("falls back to a plain post for anything else", () => {
    expect(parseComposerType(undefined).value).toBe("SIMPLE");
    expect(parseComposerType("RECIPE").value).toBe("SIMPLE");
    expect(parseComposerType(["ARTICLE", "POLL"]).value).toBe("ARTICLE");
  });

  it("never offers a type the action infers from attachments", () => {
    // IMAGE and VIDEO are set from what was uploaded. Offering them would let
    // someone pick VIDEO and attach a photo.
    const values = COMPOSER_TYPES.map((option) => option.value);
    expect(values).not.toContain("IMAGE");
    expect(values).not.toContain("VIDEO");
  });
});

describe("field table", () => {
  it("gives every type a body", () => {
    for (const option of COMPOSER_TYPES) {
      expect(typeHasField(option, "body")).toBe(true);
    }
  });

  it("puts the extra field only on the type that needs it", () => {
    expect(typeHasField(type("LINK"), "link")).toBe(true);
    expect(typeHasField(type("POLL"), "poll")).toBe(true);
    expect(typeHasField(type("SIMPLE"), "link")).toBe(false);
    expect(typeHasField(type("SIMPLE"), "poll")).toBe(false);
  });

  it("does not offer attachments on a poll", () => {
    // A poll's answer is its options; an image would have nowhere to sit.
    expect(typeHasField(type("POLL"), "media")).toBe(false);
  });
});

describe("describeIncomplete", () => {
  it("asks for a space before anything else", () => {
    expect(describeIncomplete(form({ spaceId: "" }))).toMatch(/space/i);
  });

  it("refuses an empty post", () => {
    expect(describeIncomplete(form())).toMatch(/write something/i);
  });

  it("accepts a photo with no words, as the server does", () => {
    expect(describeIncomplete(form({ attachments: 1 }))).toBeNull();
  });

  it("requires the title on the types that are built around one", () => {
    expect(describeIncomplete(form({ type: type("QUESTION"), body: "hi" }))).toMatch(
      /question/i,
    );
    expect(describeIncomplete(form({ type: type("ARTICLE"), body: "hi" }))).toMatch(
      /headline/i,
    );
    expect(
      describeIncomplete(form({ type: type("QUESTION"), title: "Why?", body: "hi" })),
    ).toBeNull();
  });

  it("leaves a link's title optional but demands the link", () => {
    expect(describeIncomplete(form({ type: type("LINK"), body: "look" }))).toMatch(
      /paste the link/i,
    );
    expect(
      describeIncomplete(form({ type: type("LINK"), link: "https://a.com", body: "x" })),
    ).toBeNull();
  });

  it("holds a poll to two real options", () => {
    const poll = (options: string[]) =>
      describeIncomplete(
        form({ type: type("POLL"), title: "Which?", pollOptions: options }),
      );
    expect(poll(["Tacos", ""])).toMatch(/two options/i);
    // Blank rows do not count towards the minimum.
    expect(poll(["Tacos", "   "])).toMatch(/two options/i);
    expect(poll(["Tacos", "Ramen"])).toBeNull();
  });

  it("matches the action's poll bounds", () => {
    // The action reads poll1..poll4, so the form must not offer a fifth.
    expect(MAX_POLL_OPTIONS).toBe(4);
    expect(MIN_POLL_OPTIONS).toBe(2);
  });
});
