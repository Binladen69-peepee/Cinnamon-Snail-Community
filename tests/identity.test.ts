import { describe, expect, it } from "vitest";
import { resolveIdentityEmail } from "@/lib/auth/identity";

describe("email identity matching", () => {
  const users = [
    {
      id: "1",
      email: "adam@veganuniversity.test",
      emails: [
        { email: "adam@veganuniversity.test", verifiedAt: new Date() },
        { email: "adam.billing@example.com", verifiedAt: new Date() },
        { email: "unverified@example.com", verifiedAt: null },
      ],
    },
  ];

  it("matches the primary email", () => {
    expect(resolveIdentityEmail("ADAM@veganuniversity.test", users)?.id).toBe("1");
  });

  it("matches a verified secondary email", () => {
    expect(resolveIdentityEmail("adam.billing@example.com", users)?.id).toBe("1");
  });

  it("does not match unverified emails", () => {
    expect(resolveIdentityEmail("unverified@example.com", users)).toBeNull();
  });
});
