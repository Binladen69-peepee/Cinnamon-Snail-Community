/**
 * One CTA, repeated. Every purchase button on the homepage and /membership uses
 * this label and this href — no secondary path competes with the purchase.
 *
 * The `#samcart-slide-open-right` fragment is what makes SamCart open its
 * slide-in panel instead of redirecting. It only works alongside the
 * `sc-slide-script.js` tag in the root layout; without that script the link
 * loads a blank checkout.
 */
export const CHECKOUT_URL =
  "https://cinnamonsnail.mysamcart.com/checkout/monthly-subscription#samcart-slide-open-right";

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
