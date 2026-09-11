import { describe, expect, it } from "vitest";
import {
  canDiscoverSpace,
  canEnterSpace,
  canJoinSpace,
  canPostInSpace,
  canEditPost,
  type UserAuth,
} from "@/lib/permissions";

const member: UserAuth = {
  id: "u1",
  roles: ["MEMBER"],
  status: "ACTIVE",
};

const staff: UserAuth = { id: "u9", roles: ["ADMIN"], status: "ACTIVE" };
const suspended: UserAuth = { id: "u8", roles: ["MEMBER"], status: "SUSPENDED" };

const space = (visibility: "PUBLIC" | "MEMBERS" | "PRIVATE") => ({
  visibility,
  postingPermission: "ALL_MEMBERS" as const,
});

describe("space permissions", () => {
  it("keeps private spaces closed without membership", () => {
    expect(
      canEnterSpace(member, { visibility: "PRIVATE", postingPermission: "ALL_MEMBERS" }, null),
    ).toBe(false);
  });

  it("allows members to post when the space is open to members", () => {
    expect(
      canPostInSpace(
        member,
        { visibility: "MEMBERS", postingPermission: "ALL_MEMBERS" },
        { role: "MEMBER" },
      ),
    ).toBe(true);
  });

  it("restricts host-only posting", () => {
    expect(
      canPostInSpace(
        member,
        { visibility: "MEMBERS", postingPermission: "HOSTS_ONLY" },
        { role: "MEMBER" },
      ),
    ).toBe(false);
  });

  it("treats MEMBERS as open, so an unjoined member can walk in", () => {
    // This is the behaviour that was broken: MEMBERS fell through to the same
    // membership check as PRIVATE, so every "open" space was invite-only and
    // nothing could be discovered and joined.
    expect(canEnterSpace(member, space("MEMBERS"), null)).toBe(true);
    expect(canEnterSpace(member, space("PUBLIC"), null)).toBe(true);
    expect(canEnterSpace(member, space("PRIVATE"), null)).toBe(false);
    expect(canEnterSpace(member, space("PRIVATE"), { role: "MEMBER" })).toBe(true);
  });

  it("hides private spaces from discovery entirely", () => {
    // Being told a room exists but not what is in it is its own kind of leak,
    // so a private space is absent from the directory and the rail.
    expect(canDiscoverSpace(member, space("PRIVATE"), null)).toBe(false);
    expect(canDiscoverSpace(member, space("PRIVATE"), { role: "MEMBER" })).toBe(true);
    expect(canDiscoverSpace(member, space("MEMBERS"), null)).toBe(true);
    expect(canDiscoverSpace(member, space("PUBLIC"), null)).toBe(true);
  });

  it("only lets members join themselves into open spaces", () => {
    expect(canJoinSpace(member, space("MEMBERS"), null)).toBe(true);
    expect(canJoinSpace(member, space("PUBLIC"), null)).toBe(true);
    // A private space needs a host to add you — that is what makes it private.
    expect(canJoinSpace(member, space("PRIVATE"), null)).toBe(false);
    // Already in it: nothing to join.
    expect(canJoinSpace(member, space("MEMBERS"), { role: "MEMBER" })).toBe(false);
  });

  it("shuts a suspended member out of everything, including discovery", () => {
    expect(canEnterSpace(suspended, space("PUBLIC"), { role: "MEMBER" })).toBe(false);
    expect(canDiscoverSpace(suspended, space("PUBLIC"), { role: "MEMBER" })).toBe(false);
    expect(canJoinSpace(suspended, space("MEMBERS"), null)).toBe(false);
  });

  it("lets staff see and enter a private space they are not in", () => {
    expect(canEnterSpace(staff, space("PRIVATE"), null)).toBe(true);
    expect(canDiscoverSpace(staff, space("PRIVATE"), null)).toBe(true);
  });

  it("lets authors edit their posts", () => {
    expect(canEditPost(member, "u1", { role: "MEMBER" })).toBe(true);
    expect(canEditPost(member, "u2", { role: "MEMBER" })).toBe(false);
  });
});
