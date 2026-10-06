import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the roadmap change (DEC-080) removed must stay removed, and what the
 * client asked for in so many words must stay said.
 *
 * Read from the source, because the rule is about what the page offers: no
 * questionnaire (members answered those questions at onboarding), one
 * sentence built from their answers, and a pace control in the client's own
 * wording.
 */

const root = process.cwd();
/** Source with whitespace collapsed, so JSX text wrapped across lines still reads as a sentence. */
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\s+/g, " ");

const page = read("app/(member)/roadmap/page.tsx");
const actions = read("app/(member)/roadmap/actions.ts");
const focus = read("components/roadmap/roadmap-focus-card.tsx");
const pace = read("components/roadmap/pace-control.tsx");

describe("the roadmap page", () => {
  it("no longer asks the onboarding questions", () => {
    expect(page).not.toMatch(/name="(cookVibe|suckiestThing|primaryBenefit|glutenFree)"/);
    expect(page).not.toMatch(/type="(radio|checkbox)"/);
    expect(page).not.toContain("saveAnswersAction");
    expect(actions).not.toContain("saveAnswers");
    // The old cadence select went with it; pace replaced it.
    expect(page).not.toContain("setCadenceAction");
    expect(actions).not.toContain("setCadence");
  });

  it("leads with the one sentence built from the member's answers", () => {
    expect(page).toContain("personalisation.sentence");
    expect(page).toMatch(/<PageHeader[^>]*description=\{ sentence/);
  });

  it("offers the pace control in the client's words", () => {
    expect(page).toContain("We’ll work with you on topics one at a time, but you control the pacing.");
    expect(page).toContain(
      "Outside of the monthly live class, how much time do you want on each topic?",
    );
    expect(page).toContain(
      "Think working with tofu, making Malaysian recipes, or mastering the art of vegan meats.",
    );
    expect(page).toContain("<form action={setPaceAction}");
    expect(page).toContain("<PaceSegments");
    expect(page).toContain("Changing it never resets your progress.");
  });

  it("shows one topic now, week X of N, what is next and what is done", () => {
    expect(page).toContain("Now · Topic {number} of {total}");
    expect(page).toMatch(/Week"\} \{schedule\.week\} of \{schedule\.weeks\}/);
    expect(page).toContain('title="Up next"');
    expect(page).toContain("Completed");
  });

  it("saves the pace through a validated, rate-limited action that leaves Kit alone", () => {
    expect(actions).toContain("weeksPerTopicSchema.safeParse(formData.get(\"weeksPerTopic\"))");
    expect(actions).toMatch(/key: `roadmap:pace:\$\{userId\}`/);
    expect(actions).toMatch(/limit: PACE_LIMIT\(userId\), kit: false/);
  });

  it("asks before throwing progress away", () => {
    // Restart and leave sit one click further in, behind their explanation.
    expect(page).toMatch(/<details className="group\/more[^"]*">.*Restart track.*Leave roadmap/);
  });
});

describe("the pace segments", () => {
  it("are one submit button per pace, so a tap saves and works before hydration", () => {
    expect(pace).toContain('"use client"');
    expect(pace).toContain('name={current ? undefined : "weeksPerTopic"}');
    expect(pace).toContain("aria-pressed={current}");
    expect(pace).toContain("WEEKS_PER_TOPIC_OPTIONS.map");
  });

  it("import nothing heavier than the pure pacing module", () => {
    // The validator lives in pace-input.ts so the browser never ships zod.
    expect(pace).toContain('from "@/lib/roadmap/pacing"');
    expect(pace).not.toContain("pace-input");
    expect(read("lib/roadmap/pacing.ts")).not.toMatch(/from "zod"|from "@\/lib\/db"/);
  });
});

describe("the roadmap focus card (contract C5)", () => {
  it("is an async server component taking the member's id", () => {
    expect(focus).not.toContain('"use client"');
    expect(focus).toContain("export async function RoadmapFocusCard({ userId }: { userId: string })");
  });

  it("renders nothing without a roadmap, or when it cannot load", () => {
    expect(focus).toMatch(/if \(!focus\) return null;/);
    expect(focus).toMatch(/catch \(error\) \{ console\.error\("\[roadmap\] focus card failed", error\); return null; \}/);
  });

  it("features the current topic with week X of N and its class", () => {
    expect(focus).toContain("Week {topic.schedule.week} of{\" \"} {topic.schedule.weeks}");
    expect(focus).toContain("href={topic.lesson.href}");
  });
});
