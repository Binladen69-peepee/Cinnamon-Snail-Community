import { describe, expect, it } from "vitest";
import {
  canEnterSpace,
  canPostInSpace,
  canEditPost,
  type UserAuth,
} from "@/lib/permissions";

const member: UserAuth = {
  id: "u1",
  roles: ["MEMBER"],
  status: "ACTIVE",
};

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

  it("lets authors edit their posts", () => {
    expect(canEditPost(member, "u1", { role: "MEMBER" })).toBe(true);
    expect(canEditPost(member, "u2", { role: "MEMBER" })).toBe(false);
  });
});
