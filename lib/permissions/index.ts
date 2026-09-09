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

export function canEnterSpace(user: UserAuth, space: SpaceAuth, membership: MembershipAuth): boolean {
  if (user.status !== "ACTIVE") return false;
  if (isStaff(user)) return true;
  if (space.visibility === "PUBLIC") return true;
  return membership !== null;
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
