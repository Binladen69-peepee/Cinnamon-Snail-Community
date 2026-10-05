/**
 * Which Kit tag a member's membership earns — the client's confirmed mapping.
 *
 *   monthly SamCart subscription → "Vegan University Monthly"
 *   annual  SamCart subscription → "Vegan University Annual"
 *
 * The tag follows the **billing interval**, not the product, because monthly
 * and annual are separate things a member buys (and separate SamCart products)
 * while being one membership here. SamCart stays the source of truth: the
 * interval comes from its webhook, and the per-SamCart-product declaration is
 * only a fallback for events that omit it.
 *
 * Pure, so the mapping can be tested without a database or a Kit account.
 */

export type BillingInterval = "month" | "year";

export type IntervalTags = {
  kitTag: string | null;
  kitTagMonthly: string | null;
  kitTagAnnual: string | null;
};

/**
 * SamCart writes the interval as free text — "month", "monthly", "1 month",
 * "year", "annual", "yearly". Everything else is unknown rather than guessed:
 * applying the wrong tag puts a member into the wrong email sequence, which is
 * worse than applying none.
 */
export function normalizeInterval(raw: string | null | undefined): BillingInterval | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value.includes("month")) return "month";
  if (value.includes("year") || value.includes("annual")) return "year";
  return null;
}

export type TagPlan = {
  /** Tags to add in Kit. */
  add: string[];
  /** Tags to remove. */
  remove: string[];
};

/**
 * What to change in Kit for one entitlement change.
 *
 * Granting applies the tag for the interval bought **and removes the other
 * one**, so moving from monthly to annual leaves a member on exactly one tag
 * rather than both. Revoking removes every tag this product can apply, because
 * somebody without the membership is on neither plan.
 *
 * An unknown interval adds nothing — a member in no sequence is recoverable, a
 * member in the wrong one has already been emailed.
 */
export function planTags(input: {
  product: IntervalTags;
  interval: BillingInterval | null;
  action: "grant" | "revoke";
}): TagPlan {
  const { product, interval, action } = input;
  const monthly = product.kitTagMonthly?.trim() || null;
  const annual = product.kitTagAnnual?.trim() || null;
  const plain = product.kitTag?.trim() || null;
  const everyTag = [monthly, annual, plain].filter((tag): tag is string => Boolean(tag));

  if (action === "revoke") {
    return { add: [], remove: [...new Set(everyTag)] };
  }

  const wanted = interval === "month" ? monthly : interval === "year" ? annual : null;
  const add = [...new Set([wanted, plain].filter((tag): tag is string => Boolean(tag)))];
  // Only the opposite interval's tag is cleared on a grant; the
  // interval-independent tag stays, since it still applies.
  const remove = [...new Set(everyTag.filter((tag) => tag !== plain && !add.includes(tag)))];
  return { add, remove };
}

/** True when this product tags by interval and we could not work out which. */
export function intervalUnresolved(product: IntervalTags, interval: BillingInterval | null): boolean {
  const tagsByInterval = Boolean(product.kitTagMonthly || product.kitTagAnnual);
  return tagsByInterval && interval === null;
}
