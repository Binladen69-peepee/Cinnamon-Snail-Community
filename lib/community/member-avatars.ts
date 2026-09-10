export const SEEDED_MEMBER_AVATARS: Record<string, string> = {
  adam: "/images/members/adam.jpg",
  sam: "/images/members/sam.jpg",
  jordan: "/images/members/jordan.jpg",
  priya: "/images/members/priya.jpg",
  lee: "/images/members/lee.jpg",
};

export const HERO_MEMBER_FACES = [
  { handle: "adam", displayName: "Adam" },
  { handle: "sam", displayName: "Sam Member" },
  { handle: "jordan", displayName: "Jordan" },
  { handle: "priya", displayName: "Priya" },
  { handle: "lee", displayName: "Lee" },
] as const;

export function resolveMemberAvatar(
  handle: string | null | undefined,
  avatarUrl?: string | null,
  displayName?: string | null,
) {
  const handleKey = handle?.trim().toLowerCase();
  const seeded = handleKey ? SEEDED_MEMBER_AVATARS[handleKey] : undefined;
  const nameKey = displayName?.trim().toLowerCase();
  const fromName =
    nameKey === "sam member"
      ? SEEDED_MEMBER_AVATARS.sam
      : nameKey
        ? SEEDED_MEMBER_AVATARS[nameKey]
        : undefined;
  return seeded ?? fromName ?? avatarUrl?.trim() ?? null;
}
