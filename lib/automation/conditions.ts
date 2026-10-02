import type { Condition } from "@/lib/automation/types";

/**
 * Evaluating a rule's conditions against the facts a trigger produced.
 *
 * Pure. Every condition must hold (BUILD.md: "IF trigger AND conditions"), and
 * an unknown fact is simply absent rather than an error — a rule that tests
 * `daysSinceJoin` against a trigger that does not produce it matches nobody,
 * which is the safe direction for something that sends email.
 */

export type Facts = Record<string, string | number | boolean | null | undefined>;

function compare(op: Condition["op"], left: unknown, right: unknown): boolean {
  switch (op) {
    case "exists":
      return left !== null && left !== undefined;
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      // Only numbers are ordered here. Comparing strings with `>` reads as a
      // rule doing something sensible while actually comparing code points.
      if (typeof left !== "number" || typeof right !== "number") return false;
      if (op === "gt") return left > right;
      if (op === "gte") return left >= right;
      if (op === "lt") return left < right;
      return left <= right;
    }
    case "in":
      return Array.isArray(right) && right.some((item) => item === left);
    case "contains":
      return (
        typeof left === "string" &&
        typeof right === "string" &&
        left.toLowerCase().includes(right.toLowerCase())
      );
  }
}

export function conditionHolds(condition: Condition, facts: Facts): boolean {
  return compare(condition.op, facts[condition.fact], condition.value);
}

export function conditionsHold(conditions: Condition[], facts: Facts): boolean {
  return conditions.every((condition) => conditionHolds(condition, facts));
}
