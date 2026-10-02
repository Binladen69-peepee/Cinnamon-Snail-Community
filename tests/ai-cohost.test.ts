import { describe, expect, it } from "vitest";
import {
  checkPrompt,
  closestRecent,
  countQuestions,
  MAX_PROMPT_CHARS,
  similarity,
} from "@/lib/ai/guardrails";
import {
  DEFAULT_SCHEDULE_CONFIG,
  isBlackout,
  parseScheduleConfig,
  PROMPT_TYPES,
  PROMPT_TYPE_BRIEF,
  PROMPT_TYPE_LABEL,
  timeForDay,
} from "@/lib/ai/types";
import { seasonOf } from "@/lib/ai/context";

const clean = "What did you cook this week that surprised you?";

describe("guardrails", () => {
  it("passes an ordinary prompt", () => {
    const verdict = checkPrompt({ text: clean });
    expect(verdict.ok).toBe(true);
    expect(verdict.findings).toEqual([]);
  });

  it("catches health claims", () => {
    for (const text of [
      "Which greens help cure inflammation?",
      "What is your favourite way to detox after the holidays?",
      "Which meal helps you lose weight fastest?",
      "What soup boosts your immune system?",
      "Which superfood do you swear by?",
    ]) {
      const verdict = checkPrompt({ text });
      expect(verdict.ok, text).toBe(false);
      expect(verdict.findings.map((f) => f.code)).toContain("health_claim");
    }
  });

  it("catches approving references to animal products but allows honest ones", () => {
    expect(checkPrompt({ text: "Nothing beats real butter in a pie crust, agreed?" }).ok).toBe(false);
    expect(checkPrompt({ text: "Add some parmesan to finish — what else?" }).ok).toBe(false);
    expect(checkPrompt({ text: "Try a little fish sauce in the broth, agreed?" }).ok).toBe(false);
    // Words with an everyday vegan version are the community's normal
    // vocabulary, so only the approving framing is caught.
    expect(checkPrompt({ text: "What is the best vegan butter you have found?" }).ok).toBe(true);
    expect(checkPrompt({ text: "Which cheese substitute finally convinced you?" }).ok).toBe(true);
    expect(checkPrompt({ text: "What do you add some cheese to first?" }).ok).toBe(true);
    expect(checkPrompt({ text: "What dish do you miss, and have you remade it yet?" }).findings.map((f) => f.code))
      .not.toContain("non_vegan");
  });

  it("catches banned terms on a word boundary, not inside another word", () => {
    expect(checkPrompt({ text: "What's cooking, guys?", bannedTerms: ["guys"] }).ok).toBe(false);
    // "ham" must not fire on "hamper".
    expect(checkPrompt({ text: "What hampers your weeknight cooking?", bannedTerms: ["ham"] }).ok).toBe(true);
  });

  it("catches stacked questions and over-length prompts", () => {
    const stacked = checkPrompt({ text: "What did you cook? Was it good?" });
    expect(stacked.findings.map((f) => f.code)).toContain("stacked_questions");
    expect(countQuestions("a? b? c?")).toBe(3);

    const long = checkPrompt({ text: `${"a".repeat(MAX_PROMPT_CHARS + 1)}?` });
    expect(long.findings.map((f) => f.code)).toContain("too_long");
  });

  it("catches a reworded repeat, not just a copy", () => {
    const recent = ["What did you cook this week that surprised you?"];
    expect(checkPrompt({ text: clean, recent }).findings.map((f) => f.code)).toContain("too_similar");
    const reworded = checkPrompt({ text: "What did you cook this week that surprised you most?", recent });
    expect(reworded.findings.map((f) => f.code)).toContain("too_similar");
    // A genuinely different question is fine.
    expect(checkPrompt({ text: "Which pan do you reach for first?", recent }).ok).toBe(true);
  });

  it("reports every problem at once, so one fix does not reveal another", () => {
    const verdict = checkPrompt({
      text: `Which superfood cures you? Did it work, guys?`,
      bannedTerms: ["guys"],
    });
    const codes = verdict.findings.map((f) => f.code);
    expect(codes).toContain("health_claim");
    expect(codes).toContain("banned_term");
    expect(codes).toContain("stacked_questions");
  });
});

describe("similarity", () => {
  it("is 0 for unrelated text and high for near-copies", () => {
    expect(similarity("what pan do you use", "name your favourite knife")).toBeLessThan(0.2);
    expect(similarity(clean, clean)).toBe(1);
    expect(similarity(clean, `${clean} really`)).toBeGreaterThan(0.6);
  });

  it("handles empty input without dividing by zero", () => {
    expect(similarity("", "something")).toBe(0);
    expect(closestRecent("anything", [])).toEqual({ score: 0, match: null });
  });

  it("finds the closest of several", () => {
    const { match } = closestRecent(clean, ["totally unrelated words here", `${clean} today`]);
    expect(match).toContain("surprised you");
  });
});

describe("schedule config", () => {
  it("falls back to defaults rather than throwing on junk", () => {
    expect(parseScheduleConfig(null)).toEqual(DEFAULT_SCHEDULE_CONFIG);
    expect(parseScheduleConfig("nonsense")).toEqual(DEFAULT_SCHEDULE_CONFIG);
    const partial = parseScheduleConfig({ days: [9, 2], defaultTime: "25:00", draftCount: 999 });
    expect(partial.days).toEqual([2]);
    expect(partial.defaultTime).toBe(DEFAULT_SCHEDULE_CONFIG.defaultTime);
    expect(partial.draftCount).toBe(20);
  });

  it("keeps a per-day time only when it is a real time", () => {
    const config = parseScheduleConfig({ days: [1, 3], timesByDay: { 1: "07:30", 3: "nope" } });
    expect(timeForDay(config, 1)).toBe("07:30");
    expect(timeForDay(config, 3)).toBe(config.defaultTime);
    expect(timeForDay(config, 2)).toBeNull();
  });

  it("reads blackout dates", () => {
    const config = parseScheduleConfig({ blackoutDates: ["2026-12-25", "garbage"] });
    expect(config.blackoutDates).toEqual(["2026-12-25"]);
    expect(isBlackout(config, "2026-12-25")).toBe(true);
    expect(isBlackout(config, "2026-12-26")).toBe(false);
  });
});

describe("prompt types", () => {
  it("ships the seven BUILD.md names, each labelled and briefed", () => {
    expect(PROMPT_TYPES).toHaveLength(7);
    for (const type of PROMPT_TYPES) {
      expect(PROMPT_TYPE_LABEL[type]).toBeTruthy();
      expect(PROMPT_TYPE_BRIEF[type]).toBeTruthy();
    }
  });
});

describe("season", () => {
  it("maps months to seasons", () => {
    expect(seasonOf(new Date("2026-01-15T00:00:00Z"))).toBe("winter");
    expect(seasonOf(new Date("2026-04-15T00:00:00Z"))).toBe("spring");
    expect(seasonOf(new Date("2026-07-15T00:00:00Z"))).toBe("summer");
    expect(seasonOf(new Date("2026-10-15T00:00:00Z"))).toBe("autumn");
    expect(seasonOf(new Date("2026-12-15T00:00:00Z"))).toBe("winter");
  });
});
