import { describe, expect, it } from "vitest";
import {
  COMPOSER_TYPES,
  composerTypesFor,
  describeIncomplete,
  isStaffOnlyType,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  parseAcceptedPostType,
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
    // IMAGE is never a choice; it is inferred from what was attached.
    expect(parseComposerType("IMAGE").value).toBe("SIMPLE");
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
  it("never asks for a space: every post goes to the Kitchen Table", () => {
    // DEC-078 retired the space picker. A missing space used to be the first
    // thing the form complained about; now it is not a thing at all.
    expect(describeIncomplete(form({ spaceId: "" }))).not.toMatch(/space/i);
    expect(describeIncomplete(form({ spaceId: undefined, body: "hello" }))).toBeNull();
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

describe("event and recipe posts", () => {
  const event = COMPOSER_TYPES.find((type) => type.value === "EVENT")!;
  const recipe = COMPOSER_TYPES.find((type) => type.value === "RECIPE")!;

  it("are offered, because both now write a row of their own", () => {
    // Neither existed while there was nothing behind them: a RECIPE post with
    // no recipe is a plain post wearing a label.
    expect(event).toBeDefined();
    expect(recipe).toBeDefined();
    expect(event.fields).toContain("event");
    expect(recipe.fields).toContain("recipe");
  });

  it("insists on a start time for an event", () => {
    const base = {
      type: event,
      title: "Soup night",
      body: "come along",
      link: "",
      pollOptions: [],
      attachments: 0,
      spaceId: "space_1",
    };
    expect(describeIncomplete({ ...base, startsAt: "" })).toContain("start time");
    expect(describeIncomplete({ ...base, startsAt: "not a date" })).toContain(
      "not one we can read",
    );
    expect(
      describeIncomplete({ ...base, startsAt: "2026-10-01T18:00" }),
    ).toBeNull();
  });

  it("insists on a method for a recipe", () => {
    const base = {
      type: recipe,
      title: "Miso soup",
      body: "a winter staple",
      link: "",
      pollOptions: [],
      attachments: 0,
      spaceId: "space_1",
    };
    expect(describeIncomplete({ ...base, method: "" })).toContain("method");
    expect(describeIncomplete({ ...base, method: "Boil water." })).toBeNull();
  });

  it("still insists on a title for both", () => {
    expect(event.titleRequired).toBe(true);
    expect(recipe.titleRequired).toBe(true);
  });
});

describe("what the Kitchen Table composer accepts", () => {
  it("offers the live-class type to hosts and staff only", () => {
    // Every Event is listed under Live Classes, which are the school's
    // classes; members post gatherings on the Bulletin Board instead.
    expect(isStaffOnlyType("EVENT")).toBe(true);
    expect(composerTypesFor(true).map((type) => type.value)).toContain("EVENT");
    expect(composerTypesFor(false).map((type) => type.value)).not.toContain("EVENT");
    expect(composerTypesFor(false).map((type) => type.value)).toEqual(
      expect.arrayContaining(["SIMPLE", "QUESTION", "ARTICLE", "POLL", "LINK", "RECIPE"]),
    );
  });

  it("calls it a live class, never an event", () => {
    expect(COMPOSER_TYPES.find((type) => type.value === "EVENT")?.label).toBe("Live class");
  });

  it("falls back to a plain post when a member asks for a staff-only type", () => {
    expect(parseComposerType("EVENT", { isStaff: false }).value).toBe("SIMPLE");
    expect(parseComposerType("EVENT", { isStaff: true }).value).toBe("EVENT");
  });

  it("refuses the types other boards write themselves", () => {
    // IDEA and BULLETIN posts are made by the Ideas board and the Bulletin
    // Board (DEC-078); a form must not be able to forge one.
    expect(parseAcceptedPostType("IDEA")).toBeNull();
    expect(parseAcceptedPostType("BULLETIN")).toBeNull();
    expect(parseAcceptedPostType("nonsense")).toBeNull();
    expect(parseAcceptedPostType("POLL")).toBe("POLL");
    // Inferred from attachments, so accepted from the action.
    expect(parseAcceptedPostType("IMAGE")).toBe("IMAGE");
    expect(parseAcceptedPostType("VIDEO")).toBe("VIDEO");
  });
});
