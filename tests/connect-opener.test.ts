import { describe, expect, it } from "vitest";
import { matchOpener, scoreCandidate, type MemberSignals } from "@/lib/social/scoring";

/**
 * The weekly match's suggested message (DEC-078): what "Message <name>" puts
 * in the composer. It is written as the message itself, says why it is
 * arriving, and the starters stored before this change become the same.
 */
function member(overrides: Partial<MemberSignals> = {}): MemberSignals {
  return {
    userId: "candidate",
    displayName: "Jordan Rivera",
    interests: [],
    skillLevel: null,
    timezone: null,
    spaceIds: [],
    lessonsCompleted: 0,
    lastActiveAt: null,
    priorInteractions: 0,
    ...overrides,
  };
}

const viewer = member({ userId: "viewer", displayName: "Adam", interests: ["tofu"], lessonsCompleted: 4 });

describe("new matches", () => {
  it("store a ready-to-send message addressed to the match by first name", () => {
    const { starter } = scoreCandidate(viewer, member({ interests: ["tofu"] }));
    expect(starter).toMatch(/^Hi Jordan!/);
    expect(starter).toContain("Connect suggested we meet this week");
    expect(starter).toContain("tofu");
    expect(starter.endsWith("?")).toBe(true);
  });

  it("fall back to the lessons, then to what they are cooking", () => {
    const progress = scoreCandidate(viewer, member({ lessonsCompleted: 5 })).starter;
    expect(progress).toContain("Which lesson finally clicked for you?");
    const plain = scoreCandidate(
      { ...viewer, lessonsCompleted: 40 },
      member({ lessonsCompleted: 0 }),
    ).starter;
    expect(plain).toContain("What's on your plate lately?");
  });
});

describe("the opener for a stored match", () => {
  it("turns the old advice into the message", () => {
    expect(matchOpener("Ask Sam what they last made with tofu.", "Sam Lee")).toBe(
      "Hi Sam! Connect suggested we meet this week, and we both cook tofu. What's the last thing you made?",
    );
    expect(matchOpener("Ask Sam which lesson finally clicked for them.", "Sam Lee")).toContain(
      "Which lesson finally clicked for you?",
    );
    expect(matchOpener("Ask Sam what is on their plate this week.", "Sam Lee")).toBe(
      "Hi Sam! Connect suggested we meet this week. What's on your plate lately?",
    );
  });

  it("uses a stored message as it is", () => {
    const message = "Hi Sam! Connect suggested we meet this week. What's on your plate lately?";
    expect(matchOpener(message, "Sam Lee")).toBe(message);
  });

  it("never comes back empty", () => {
    expect(matchOpener("", "Sam Lee")).toContain("Hi Sam!");
    expect(matchOpener("Ask Sam something new.", "")).toContain("Hi there!");
  });
});
