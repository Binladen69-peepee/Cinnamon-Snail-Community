export type ProfilePrivacy = {
  showLocation: boolean;
  showLinks: boolean;
  showInterests: boolean;
};

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
