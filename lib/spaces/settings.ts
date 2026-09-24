import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import { canManageSpace, isStaff, type MembershipAuth } from "@/lib/permissions";
import { PermissionError } from "@/lib/community/engagement";
import { writeAuditLog } from "@/lib/audit";

/**
 * Changing what a space is.
 *
 * Until now nothing in the product could write a Space row: every room came
 * from the seed, and the settings the schema carried — who may post, whether
 * posts are reviewed, what product opens the door — were columns nobody could
 * reach. This is the missing half.
 *
 * Every function here is gated on `canManageSpace`, which is narrower than
 * moderation on purpose. A moderator takes a post down; only the host or staff
 * decides what the room is, who may speak in it, and what it is sold with.
 * Every change is written to the audit log, because these are the settings
 * that decide who can see what.
 */

export const SPACE_KINDS = ["FEED", "COURSE", "EVENTS", "CHAT", "MEMBERS"] as const;
export const SPACE_VISIBILITIES = ["PUBLIC", "MEMBERS", "PRIVATE"] as const;
export const POSTING_PERMISSIONS = [
  "ALL_MEMBERS",
  "HOSTS_ONLY",
  "APPROVAL_REQUIRED",
] as const;
export const NOTIFICATION_LEVELS = ["ALL", "HIGHLIGHTS", "NONE"] as const;

export type SpaceKindValue = (typeof SPACE_KINDS)[number];
export type SpaceVisibilityValue = (typeof SPACE_VISIBILITIES)[number];
export type PostingPermissionValue = (typeof POSTING_PERMISSIONS)[number];
export type NotificationLevelValue = (typeof NOTIFICATION_LEVELS)[number];

export const VISIBILITY_COPY: Record<
  SpaceVisibilityValue,
  { label: string; hint: string }
> = {
  PUBLIC: {
    label: "Open to everyone",
    hint: "Anyone who reaches the app can read and join.",
  },
  MEMBERS: {
    label: "Open to members",
    hint: "Every member can find it, read it and join it.",
  },
  PRIVATE: {
    label: "Private",
    hint: "Only its members can see that it exists. A host adds people.",
  },
};

export const POSTING_COPY: Record<
  PostingPermissionValue,
  { label: string; hint: string }
> = {
  ALL_MEMBERS: { label: "Anyone in the space", hint: "Posts appear immediately." },
  HOSTS_ONLY: {
    label: "Hosts and moderators only",
    hint: "Members can read and comment, but not start posts.",
  },
  APPROVAL_REQUIRED: {
    label: "Anyone, after review",
    hint: "New posts wait for a host before anyone else sees them.",
  },
};

export const NOTIFICATION_COPY: Record<
  NotificationLevelValue,
  { label: string; hint: string }
> = {
  ALL: { label: "Every post", hint: "Members hear about everything posted here." },
  HIGHLIGHTS: {
    label: "Highlights only",
    hint: "Replies and mentions still come through.",
  },
  NONE: { label: "Nothing", hint: "The space still shows unread counts." },
};

function oneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
): T[number] | null {
  return typeof value === "string" && (values as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

async function requireManager(userId: string, spaceId: string) {
  const auth = await getUserAuth(userId);
  if (!auth) throw new PermissionError("You need to sign in.");
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      id: true,
      slug: true,
      name: true,
      visibility: true,
      postingPermission: true,
      productId: true,
      approvalRequired: true,
      hostUserId: true,
    },
  });
  if (!space) throw new PermissionError("That space does not exist.");
  const row = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
    select: { role: true },
  });
  const membership: MembershipAuth = row ? { role: row.role } : null;
  if (!canManageSpace(auth, space, membership)) {
    throw new PermissionError("Only a host can change this space.");
  }
  return { auth, space };
}

export type SpaceSettingsInput = {
  name: string;
  description: string | null;
  icon: string | null;
  coverUrl: string | null;
  kind: string;
  visibility: string;
  postingPermission: string;
  notificationDefault: string;
  sortOrder: number;
  groupId: string | null;
  /** Empty string means "no product", which is different from "unchanged". */
  productId: string | null;
};

/**
 * Writes the settings, after checking every one of them.
 *
 * Enum values arrive from a form, which means they arrive from anyone. Each is
 * matched against the list the product actually supports rather than cast, so
 * a hand-rolled request cannot put a space into a state no code handles.
 *
 * Only staff may attach a product. A host changing their own room must not be
 * able to put it behind a paywall, or take it out from behind one, because
 * that decides who is paying for what.
 */
export async function updateSpaceSettings(
  userId: string,
  spaceId: string,
  input: SpaceSettingsInput,
) {
  const { auth, space } = await requireManager(userId, spaceId);

  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new PermissionError("A space name needs between 2 and 80 characters.");
  }

  const kind = oneOf(SPACE_KINDS, input.kind);
  const visibility = oneOf(SPACE_VISIBILITIES, input.visibility);
  const postingPermission = oneOf(POSTING_PERMISSIONS, input.postingPermission);
  const notificationDefault = oneOf(NOTIFICATION_LEVELS, input.notificationDefault);
  if (!kind || !visibility || !postingPermission || !notificationDefault) {
    throw new PermissionError("Those settings are not ones we recognise.");
  }

  let groupId: string | null = null;
  if (input.groupId) {
    const group = await prisma.spaceGroup.findUnique({
      where: { id: input.groupId },
      select: { id: true },
    });
    if (!group) throw new PermissionError("That section does not exist.");
    groupId = group.id;
  }

  // Product access stays with staff.
  let productId = space.productId;
  if (isStaff(auth)) {
    if (input.productId) {
      const product = await prisma.product.findUnique({
        where: { id: input.productId },
        select: { id: true },
      });
      if (!product) throw new PermissionError("That product does not exist.");
      productId = product.id;
    } else {
      productId = null;
    }
  }

  const updated = await prisma.space.update({
    where: { id: spaceId },
    data: {
      name,
      description: input.description?.trim() || null,
      icon: input.icon?.trim().slice(0, 8) || null,
      coverUrl: input.coverUrl?.trim() || null,
      kind,
      visibility,
      postingPermission,
      // The boolean and the posting permission mean the same thing, so they are
      // kept in step rather than left to disagree.
      approvalRequired: postingPermission === "APPROVAL_REQUIRED",
      notificationDefault,
      sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
      groupId,
      productId,
    },
    select: { id: true, slug: true },
  });

  await writeAuditLog({
    actorId: userId,
    action: "space.settings_updated",
    targetType: "space",
    targetId: spaceId,
    metadata: {
      visibility,
      postingPermission,
      notificationDefault,
      productChanged: productId !== space.productId,
    },
  }).catch(() => undefined);

  return updated;
}

export const SPACE_ROLES = ["MEMBER", "MODERATOR", "HOST"] as const;
export type SpaceRoleValue = (typeof SPACE_ROLES)[number];

/**
 * Changing what someone is in a space.
 *
 * A space must always have at least one host, so the last one cannot be
 * demoted. Losing the only person who can change a room's settings is not
 * recoverable from inside the product.
 */
export async function setMemberRole(
  userId: string,
  spaceId: string,
  targetUserId: string,
  role: string,
) {
  await requireManager(userId, spaceId);
  const next = oneOf(SPACE_ROLES, role);
  if (!next) throw new PermissionError("That is not a role.");

  const target = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) throw new PermissionError("They are not in this space.");

  if (target.role === "HOST" && next !== "HOST") {
    const hosts = await prisma.spaceMembership.count({
      where: { spaceId, role: "HOST" },
    });
    if (hosts <= 1) {
      throw new PermissionError("A space needs at least one host.");
    }
  }

  await prisma.spaceMembership.update({
    where: { spaceId_userId: { spaceId, userId: targetUserId } },
    data: { role: next },
  });

  await writeAuditLog({
    actorId: userId,
    action: "space.role_changed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { spaceId, from: target.role, to: next },
  }).catch(() => undefined);
}

/** Taking someone out of a space. */
export async function removeMember(
  userId: string,
  spaceId: string,
  targetUserId: string,
) {
  await requireManager(userId, spaceId);
  if (targetUserId === userId) {
    throw new PermissionError("Use leave, rather than removing yourself.");
  }
  const target = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return;
  if (target.role === "HOST") {
    throw new PermissionError("Change their role before removing them.");
  }
  await prisma.spaceMembership.delete({
    where: { spaceId_userId: { spaceId, userId: targetUserId } },
  });
  await writeAuditLog({
    actorId: userId,
    action: "space.member_removed",
    targetType: "user",
    targetId: targetUserId,
    metadata: { spaceId },
  }).catch(() => undefined);
}

/** The sections spaces can be filed under, for the settings form. */
export async function listSpaceGroups() {
  return prisma.spaceGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 50,
    select: { id: true, name: true, slug: true, sortOrder: true },
  });
}

/** The products a staff member can attach, for the settings form. */
export async function listAttachableProducts() {
  return prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    take: 50,
    select: { id: true, name: true, slug: true },
  });
}

/** The space, loaded for its own settings form. */
export async function getSpaceSettings(userId: string, slug: string) {
  const space = await prisma.space.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
      coverUrl: true,
      kind: true,
      visibility: true,
      postingPermission: true,
      approvalRequired: true,
      notificationDefault: true,
      sortOrder: true,
      groupId: true,
      productId: true,
      hostUserId: true,
    },
  });
  if (!space) return null;
  try {
    await requireManager(userId, space.id);
  } catch {
    return null;
  }
  const auth = await getUserAuth(userId);
  return { space, canSetProduct: auth ? isStaff(auth) : false };
}
