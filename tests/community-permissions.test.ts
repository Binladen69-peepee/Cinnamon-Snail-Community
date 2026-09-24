import { describe, expect, it } from "vitest";
import {
  canEnterSpace,
  canJoinSpace,
  canManageSpace,
  canModerateSpace,
  canPostInSpace,
  meetsProductRule,
  postNeedsApproval,
  type SpaceAuth,
  type UserAuth,
} from "@/lib/permissions";

/**
 * The rules the community layer is built on, in their pure form.
 *
 * Three of these were not enforced anywhere before: a space sold with a
 * product let anyone in, a space set to require approval published straight
 * away, and there was no notion of who may change a space at all. Each is the
 * kind of gap that is invisible until it is exploited, so each is pinned here.
 */

const member: UserAuth = {
  id: "u_member",
  roles: ["MEMBER"],
  status: "ACTIVE",
  entitledProductIds: [],
};

const paying: UserAuth = { ...member, id: "u_paying", entitledProductIds: ["p_pro"] };
const staff: UserAuth = { ...member, id: "u_staff", roles: ["ADMIN"] };
const suspended: UserAuth = { ...member, id: "u_susp", status: "SUSPENDED" };

const open: SpaceAuth = { visibility: "MEMBERS", postingPermission: "ALL_MEMBERS" };
const paid: SpaceAuth = { ...open, productId: "p_pro" };
const secret: SpaceAuth = { ...open, visibility: "PRIVATE" };
const reviewed: SpaceAuth = { ...open, postingPermission: "APPROVAL_REQUIRED" };

describe("product-gated spaces", () => {
  it("opens only for someone holding the product", () => {
    expect(meetsProductRule(member, paid)).toBe(false);
    expect(meetsProductRule(paying, paid)).toBe(true);
    expect(canEnterSpace(member, paid, { role: "MEMBER" })).toBe(false);
    expect(canEnterSpace(paying, paid, null)).toBe(true);
  });

  it("stays closed even to a member of the space", () => {
    // A lapsed payment revokes the entitlement; the membership row outlives it
    // and must not be enough on its own.
    expect(canEnterSpace(member, paid, { role: "MODERATOR" })).toBe(false);
  });

  it("is open to every member when no product is attached", () => {
    expect(meetsProductRule(member, open)).toBe(true);
    expect(meetsProductRule(member, { ...open, productId: null })).toBe(true);
  });

  it("treats unloaded entitlements as holding nothing", () => {
    // A caller that forgets to load them gets a closed door, not an open one.
    const forgot: UserAuth = { id: "u", roles: ["MEMBER"], status: "ACTIVE" };
    expect(meetsProductRule(forgot, paid)).toBe(false);
  });

  it("cannot be joined without the product", () => {
    expect(canJoinSpace(member, paid, null)).toBe(false);
    expect(canJoinSpace(paying, paid, null)).toBe(true);
  });

  it("stays listed rather than hidden", () => {
    // It is something to buy, not something to hide. Hiding it would mean
    // nobody discovers what the membership is for.
    expect(canEnterSpace(member, paid, null)).toBe(false);
  });

  it("does not stop staff", () => {
    expect(canEnterSpace(staff, paid, null)).toBe(true);
  });
});

describe("posts held for review", () => {
  it("queues a member's post when the space says so", () => {
    expect(postNeedsApproval(member, reviewed, { role: "MEMBER" })).toBe(true);
  });

  it("honours the older approvalRequired flag too", () => {
    // Two columns express the same intention and both exist in the data.
    expect(
      postNeedsApproval(member, { ...open, approvalRequired: true }, { role: "MEMBER" }),
    ).toBe(true);
  });

  it("never queues the people who answer the queue", () => {
    // Making a host wait on themselves is a deadlock.
    expect(postNeedsApproval(member, reviewed, { role: "HOST" })).toBe(false);
    expect(postNeedsApproval(member, reviewed, { role: "MODERATOR" })).toBe(false);
    expect(postNeedsApproval(staff, reviewed, null)).toBe(false);
  });

  it("does not stop them posting, only publishing", () => {
    expect(canPostInSpace(member, reviewed, { role: "MEMBER" })).toBe(true);
  });

  it("leaves an ordinary space alone", () => {
    expect(postNeedsApproval(member, open, { role: "MEMBER" })).toBe(false);
  });
});

describe("who may change a space", () => {
  it("is the host, not every moderator", () => {
    // A moderator removes a post. Only a host decides what the room is.
    expect(canManageSpace(member, open, { role: "HOST" })).toBe(true);
    expect(canManageSpace(member, open, { role: "MODERATOR" })).toBe(false);
    expect(canManageSpace(member, open, { role: "MEMBER" })).toBe(false);
  });

  it("honours the host column as well as the membership role", () => {
    // Both notions of host exist in the schema and both are real.
    expect(canManageSpace(member, { ...open, hostUserId: member.id }, null)).toBe(true);
  });

  it("includes staff and excludes suspended accounts", () => {
    expect(canManageSpace(staff, open, null)).toBe(true);
    expect(canManageSpace(suspended, open, { role: "HOST" })).toBe(false);
  });

  it("is narrower than moderation", () => {
    expect(canModerateSpace(member, { role: "MODERATOR" })).toBe(true);
    expect(canManageSpace(member, open, { role: "MODERATOR" })).toBe(false);
  });
});

describe("the older rules still hold", () => {
  it("keeps a private room private", () => {
    expect(canEnterSpace(member, secret, null)).toBe(false);
    expect(canEnterSpace(member, secret, { role: "MEMBER" })).toBe(true);
  });

  it("shuts out a suspended member everywhere", () => {
    expect(canEnterSpace(suspended, open, { role: "HOST" })).toBe(false);
    expect(canJoinSpace(suspended, open, null)).toBe(false);
  });
});
