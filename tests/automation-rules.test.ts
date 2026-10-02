import { describe, expect, it } from "vitest";
import {
  parseActions,
  parseConditions,
  parseRule,
  RuleParseError,
  TRIGGERS,
  TRIGGER_LABEL,
} from "@/lib/automation/types";
import { conditionsHold } from "@/lib/automation/conditions";
import { fillTemplate } from "@/lib/automation/actions";
import { INITIAL_RULES } from "@/lib/automation/initial-rules";

const okActions = [{ type: "notification", category: "SYSTEM", title: "t", body: "b" }];

describe("parsing a rule", () => {
  it("reads trigger params and condition tests out of one column", () => {
    const rule = parseRule({
      id: "r1",
      slug: "s",
      name: "n",
      trigger: "inactivity",
      conditions: { params: { days: 30 }, list: [{ fact: "daysQuiet", op: "gte", value: 30 }] },
      actions: okActions,
    });
    expect(rule.params).toEqual({ days: 30 });
    expect(rule.conditions).toEqual([{ fact: "daysQuiet", op: "gte", value: 30 }]);
    expect(rule.actions).toHaveLength(1);
  });

  it("accepts a bare list of conditions, for a rule with no params", () => {
    const rule = parseRule({
      id: "r1", slug: "s", name: "n", trigger: "anniversary",
      conditions: [{ fact: "years", op: "gte", value: 1 }],
      actions: okActions,
    });
    expect(rule.conditions).toHaveLength(1);
    expect(rule.params).toEqual({});
  });

  it("refuses rather than half-running anything malformed", () => {
    const base = { id: "r1", slug: "s", name: "n", conditions: [], actions: okActions };
    expect(() => parseRule({ ...base, trigger: "not_a_trigger" })).toThrow(RuleParseError);
    expect(() => parseActions([])).toThrow(RuleParseError);
    expect(() => parseActions([{ type: "nope" }])).toThrow(RuleParseError);
    // A second action being broken must invalidate the whole rule, not leave
    // the first one to fire on its own.
    expect(() => parseActions([...okActions, { type: "email", subject: "s" }])).toThrow(RuleParseError);
    expect(() => parseConditions([{ fact: "x", op: "bogus" }])).toThrow(RuleParseError);
    expect(() => parseConditions([{ fact: "x", op: "in", value: "not-a-list" }])).toThrow(RuleParseError);
    expect(() => parseActions([{ type: "notification", category: "DMS", title: "t", body: "b" }])).toThrow(
      RuleParseError,
    );
  });

  it("caps how much one rule can do", () => {
    const many = Array.from({ length: 11 }, () => okActions[0]);
    expect(() => parseActions(many)).toThrow(RuleParseError);
  });
});

describe("conditions", () => {
  const facts = { daysQuiet: 30, status: "PAST_DUE", email: "a@b.c", nothing: null };

  it("needs every condition to hold", () => {
    expect(conditionsHold([{ fact: "daysQuiet", op: "gte", value: 30 }], facts)).toBe(true);
    expect(
      conditionsHold(
        [
          { fact: "daysQuiet", op: "gte", value: 30 },
          { fact: "status", op: "eq", value: "DELINQUENT" },
        ],
        facts,
      ),
    ).toBe(false);
  });

  it("treats an unknown fact as no match, never as a pass", () => {
    expect(conditionsHold([{ fact: "missing", op: "gte", value: 1 }], facts)).toBe(false);
    expect(conditionsHold([{ fact: "missing", op: "exists" }], facts)).toBe(false);
    expect(conditionsHold([{ fact: "nothing", op: "exists" }], facts)).toBe(false);
    expect(conditionsHold([{ fact: "daysQuiet", op: "exists" }], facts)).toBe(true);
  });

  it("only orders numbers, so strings cannot compare by accident", () => {
    expect(conditionsHold([{ fact: "status", op: "gt", value: "A" }], facts)).toBe(false);
  });

  it("supports in and contains", () => {
    expect(conditionsHold([{ fact: "status", op: "in", value: ["PAST_DUE", "DELINQUENT"] }], facts)).toBe(true);
    expect(conditionsHold([{ fact: "email", op: "contains", value: "@B.C" }], facts)).toBe(true);
  });

  it("no conditions means the trigger alone decides", () => {
    expect(conditionsHold([], facts)).toBe(true);
  });
});

describe("message templates", () => {
  it("fills facts and leaves unknown placeholders visible", () => {
    expect(fillTemplate("It has been {{daysQuiet}} days", { daysQuiet: 30 })).toBe("It has been 30 days");
    expect(fillTemplate("Hi {{nope}}", { daysQuiet: 1 })).toBe("Hi {{nope}}");
    expect(fillTemplate("{{ milestoneTopic }}", { milestoneTopic: "Knife skills" })).toBe("Knife skills");
  });
});

describe("the shipped rules", () => {
  it("ships the fourteen BUILD.md asks for, each parseable", () => {
    expect(INITIAL_RULES).toHaveLength(14);
    for (const rule of INITIAL_RULES) {
      expect(() =>
        parseRule({
          id: rule.slug,
          slug: rule.slug,
          name: rule.name,
          trigger: rule.trigger,
          conditions: { params: rule.params ?? {}, list: rule.conditions ?? [] },
          actions: rule.actions,
        }),
      ).not.toThrow();
    }
  });

  it("has unique slugs and known triggers", () => {
    const slugs = INITIAL_RULES.map((rule) => rule.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const rule of INITIAL_RULES) expect(TRIGGERS).toContain(rule.trigger);
  });

  it("labels every trigger for the console", () => {
    for (const trigger of TRIGGERS) expect(TRIGGER_LABEL[trigger]).toBeTruthy();
  });
});
