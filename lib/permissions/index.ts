export type SpaceAuth = {
  visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  postingPermission: "ALL_MEMBERS" | "HOSTS_ONLY" | "APPROVAL_REQUIRED";
};

export type MembershipAuth = {
  role: "MEMBER" | "MODERATOR" | "HOST";
} | null;

export type UserAuth = {
  id: string;
  roles: Array<"MEMBER" | "HOST" | "ADMIN" | "SUPER_ADMIN">;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";
};

export function isStaff(user: UserAuth): boolean {
  return user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN");
}

/**
 * Three visibilities, three behaviours.
 *
 * PUBLIC   - anyone who can reach the app.
 * MEMBERS  - any active member of the community, whether or not they have
 *            joined this space. This is Circle's "open" space, and it is what
 *            makes joining a real action rather than an invitation.
 * PRIVATE  - members of this space only, and absent from the directory.
 *
 * MEMBERS previously behaved identically to PRIVATE — both fell through to
 * `membership !== null` — so every "open" space was in practice invite-only and
 * nothing could ever be discovered and joined.
 */
export function canEnterSpace(user: UserAuth, space: SpaceAuth, membership: MembershipAuth): boolean {
  if (user.status !== "ACTIVE") return false;
  if (isStaff(user)) return true;
  if (space.visibility === "PUBLIC") return true;
  if (space.visibility === "MEMBERS") return true;
  return membership !== null;
}

/**
 * Whether a space should appear in the directory and the rail at all.
 *
 * A private space is invisible to anyone who is not in it — being told a room
 * exists but not what is in it is its own kind of leak.
 */
export function canDiscoverSpace(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (isStaff(user)) return true;
  if (space.visibility === "PRIVATE") return membership !== null;
  return true;
}

/**
 * Whether this member can add themselves.
 *
 * Only open spaces are self-serve; a private space needs a host to add you,
 * which is the whole point of it being private.
 */
export function canJoinSpace(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (membership !== null) return false;
  return space.visibility === "PUBLIC" || space.visibility === "MEMBERS";
}

export function canPostInSpace(user: UserAuth, space: SpaceAuth, membership: MembershipAuth): boolean {
  if (!canEnterSpace(user, space, membership)) return false;
  if (isStaff(user)) return true;
  if (!membership) return false;
  if (space.postingPermission === "HOSTS_ONLY") {
    return membership.role === "HOST" || membership.role === "MODERATOR";
  }
  return true;
}

export function canModerateSpace(user: UserAuth, membership: MembershipAuth): boolean {
  if (isStaff(user)) return true;
  return membership?.role === "HOST" || membership?.role === "MODERATOR";
}

export function canEditPost(user: UserAuth, authorId: string, membership: MembershipAuth): boolean {
  if (user.id === authorId) return true;
  return canModerateSpace(user, membership);
}
