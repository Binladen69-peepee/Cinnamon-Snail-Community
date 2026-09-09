export const SEEDED_MEMBER_AVATARS: Record<string, string> = {
  adam: "/avatars/adam.jpg",
  sam: "/avatars/sam.jpg",
  jordan: "/avatars/jordan.jpg",
  priya: "/avatars/priya.jpg",
  lee: "/avatars/lee.jpg",
};

export function resolveMemberAvatar(
  handle: string | null | undefined,
  avatarUrl?: string | null,
) {
  if (avatarUrl) return avatarUrl;
  if (!handle) return null;
  return SEEDED_MEMBER_AVATARS[handle] ?? null;
}
