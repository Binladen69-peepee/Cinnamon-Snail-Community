/**
 * SamCart products that sell the membership (DEC-086). 849150 (monthly) and
 * 849151 (annual) are the live paid products the site's checkout sells;
 * 1069354 and 1069358 are their 1-month-free versions, kept so members who
 * joined through them keep their access. Period length always comes from
 * SamCart (DEC-001).
 */
export const MEMBERSHIP_SAMCART_PRODUCT_IDS = ["849150", "849151", "1069358", "1069354"] as const;

export const ACCOUNT_DELETION_GRACE_DAYS_DEFAULT = 7;

export function getDeletionGraceDays() {
  const raw = process.env.ACCOUNT_DELETION_GRACE_DAYS;
  if (raw == null || raw.trim() === "") return ACCOUNT_DELETION_GRACE_DAYS_DEFAULT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return ACCOUNT_DELETION_GRACE_DAYS_DEFAULT;
  return parsed;
}

export function isMembershipSamcartProduct(productId: string | null | undefined) {
  if (!productId) return false;
  return MEMBERSHIP_SAMCART_PRODUCT_IDS.includes(
    productId as (typeof MEMBERSHIP_SAMCART_PRODUCT_IDS)[number],
  );
}
