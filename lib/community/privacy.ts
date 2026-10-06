export type ProfilePrivacy = {
  showLocation: boolean;
  showLinks: boolean;
  showInterests: boolean;
};

export type PrivacyField = keyof ProfilePrivacy;

const defaults: ProfilePrivacy = {
  showLocation: true,
  showLinks: true,
  showInterests: true,
};

export function readPrivacy(value: unknown): ProfilePrivacy {
  if (!value || typeof value !== "object") return { ...defaults };
  const raw = value as Record<string, unknown>;
  return {
    showLocation: raw.showLocation !== false,
    showLinks: raw.showLinks !== false,
    showInterests: raw.showInterests !== false,
  };
}

export function visibleProfileFields(
  privacy: ProfilePrivacy,
  isOwner: boolean,
): ProfilePrivacy {
  if (isOwner) {
    return { showLocation: true, showLinks: true, showInterests: true };
  }
  return privacy;
}

/**
 * Whether two members both let a field be shown.
 *
 * "What you have in common" is read from both profiles, so it is only fair
 * when both agreed: a member who hides how they cook is not shown "you both
 * cook Japanese" on anyone's profile, and is not told it on theirs either.
 * Reciprocal by construction, so the panel reads the same from either side.
 */
export function bothAllow(
  a: ProfilePrivacy,
  b: ProfilePrivacy,
  field: PrivacyField,
): boolean {
  return a[field] && b[field];
}
