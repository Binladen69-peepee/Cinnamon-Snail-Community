/**
 * One CTA, repeated. Every purchase button on the homepage and /membership uses
 * this label and this href — no secondary path competes with the purchase.
 *
 * The `#samcart-slide-open-right` fragment is what makes SamCart open its
 * slide-in panel instead of redirecting. It only works alongside the
 * `sc-slide-script.js` tag in the root layout; without that script the link
 * loads a blank checkout.
 *
 * The checkout is SamCart product 1069354, the monthly free-month membership,
 * which also offers the annual one (1069358) — the two products the billing
 * webhook grants membership and Kit tags for. It is addressed by id because a
 * slug can be renamed in SamCart. The old `monthly-subscription` checkout sold
 * product 849150, which billing does not recognise, so a purchase through it
 * granted nothing, and testing the membership in Test Mode never reached it.
 */
export const CHECKOUT_URL =
  "https://cinnamonsnail.mysamcart.com/checkout/1069354#samcart-slide-open-right";

export const CHECKOUT_LABEL = "Become a member";

export const SAMCART_SLIDE_SCRIPT =
  "https://static.samcart.com/checkouts/sc-slide-script.js";

/** Shown under the CTA on the membership teaser card. */
export const CANCEL_REASSURANCE =
  "Cancel whenever you want, no contract, no hoops to jump through, no hard feelings.";

export const PRICING = {
  monthly: "$59/month",
  yearly: "$599",
  yearlyNote: "that's 2 months free",
} as const;

/** The two SamCart billing periods. Same membership, two ways to pay. */
export const MEMBERSHIP_PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: PRICING.monthly.replace(/\/.*$/, ""),
    period: "per month",
    note: null,
    featured: false,
  },
  {
    id: "yearly",
    name: "Yearly",
    price: PRICING.yearly,
    period: "per year",
    note: PRICING.yearlyNote,
    featured: true,
  },
] as const;
