export type SpaceAuth = {
  visibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  postingPermission: "ALL_MEMBERS" | "HOSTS_ONLY" | "APPROVAL_REQUIRED";
  /** Null means membership alone opens the room. */
  productId?: string | null;
  approvalRequired?: boolean;
  /** Set when one person owns the room outright. */
  hostUserId?: string | null;
};

export type MembershipAuth = {
  role: "MEMBER" | "MODERATOR" | "HOST";
} | null;

export type UserAuth = {
  id: string;
  roles: Array<"MEMBER" | "HOST" | "ADMIN" | "SUPER_ADMIN">;
  status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED";
  /**
   * Products this member currently holds. Absent means "not loaded", which is
   * treated as holding nothing — a caller that forgets to load entitlements
   * gets a closed door rather than an open one.
   */
  entitledProductIds?: string[];
};

export function isStaff(user: UserAuth): boolean {
  return user.roles.includes("ADMIN") || user.roles.includes("SUPER_ADMIN");
}

/**
 * Whether this member holds whatever product the space is sold with.
 *
 * A space with no product is open to every member, which is every general
 * room. A space with one is the reason the product exists, so the check is
 * against live entitlements rather than against a subscription record: a
 * lapsed payment revokes the entitlement, and this follows it immediately.
 */
export function meetsProductRule(user: UserAuth, space: SpaceAuth): boolean {
  if (!space.productId) return true;
  return (user.entitledProductIds ?? []).includes(space.productId);
}

/**
 * Three visibilities, three behaviours.
 *
 * PUBLIC   - anyone who can reach the app.
 * MEMBERS  - any active member of the community, whether or not they have
 *            joined this space. This is the "open" space, and it is what makes
 *            joining a real action rather than an invitation.
 * PRIVATE  - members of this space only, and absent from the directory.
 *
 * MEMBERS once behaved identically to PRIVATE — both fell through to
 * `membership !== null` — so every open space was in practice invite-only and
 * nothing could ever be discovered and joined.
 *
 * The product rule sits on top of all three: a space can be openly listed and
 * still closed to someone who has not bought what it belongs to.
 */
export function canEnterSpace(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (isStaff(user)) return true;
  if (!meetsProductRule(user, space)) return false;
  if (space.visibility === "PUBLIC") return true;
  if (space.visibility === "MEMBERS") return true;
  return membership !== null;
}

/**
 * Whether a space should appear in the directory and the rail at all.
 *
 * A private space is invisible to anyone who is not in it — being told a room
 * exists but not what is in it is its own kind of leak. A product-gated space
 * stays listed, because it is something to buy rather than something to hide;
 * what it will not do is let anyone in.
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
 * which is the whole point of it being private. A product-gated space refuses
 * too, because joining it would hand out what the product sells.
 */
export function canJoinSpace(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (membership !== null) return false;
  if (!meetsProductRule(user, space)) return false;
  return space.visibility === "PUBLIC" || space.visibility === "MEMBERS";
}

export function canPostInSpace(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (!canEnterSpace(user, space, membership)) return false;
  if (isStaff(user)) return true;
  if (!membership) return false;
  if (space.postingPermission === "HOSTS_ONLY") {
    return membership.role === "HOST" || membership.role === "MODERATOR";
  }
  return true;
}

/**
 * Whether what this member writes here goes live or goes into a queue.
 *
 * Two settings express the same intention and both are honoured: the posting
 * permission `APPROVAL_REQUIRED`, and the older `approvalRequired` flag.
 * Hosts and staff are never queued — somebody has to be able to answer the
 * queue, and making them wait on themselves is a deadlock.
 */
export function postNeedsApproval(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (isStaff(user)) return false;
  if (membership?.role === "HOST" || membership?.role === "MODERATOR") return false;
  return (
    space.postingPermission === "APPROVAL_REQUIRED" ||
    space.approvalRequired === true
  );
}

export function canModerateSpace(
  user: UserAuth,
  membership: MembershipAuth,
): boolean {
  if (isStaff(user)) return true;
  return membership?.role === "HOST" || membership?.role === "MODERATOR";
}

/**
 * Whether this member can change the room itself: its name, who may post, what
 * it is sold with.
 *
 * Deliberately narrower than moderation. A moderator removes a post; only the
 * host or staff decides what the space is. The two notions of host in the
 * schema — the `hostUserId` column and a membership with role HOST — are both
 * honoured here, because both exist in the data.
 */
export function canManageSpace(
  user: UserAuth,
  space: SpaceAuth,
  membership: MembershipAuth,
): boolean {
  if (user.status !== "ACTIVE") return false;
  if (isStaff(user)) return true;
  if (space.hostUserId && space.hostUserId === user.id) return true;
  return membership?.role === "HOST";
}

export function canEditPost(
  user: UserAuth,
  authorId: string,
  membership: MembershipAuth,
): boolean {
  if (user.id === authorId) return true;
  return canModerateSpace(user, membership);
}
