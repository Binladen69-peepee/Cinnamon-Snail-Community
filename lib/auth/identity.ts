import { normalizeEmail } from "@/lib/community/format";

export type IdentityLookup = {
  id: string;
  email: string;
  emails: { email: string; verifiedAt: Date | null }[];
};

export function resolveIdentityEmail(
  typedEmail: string,
  users: IdentityLookup[],
): IdentityLookup | null {
  const email = normalizeEmail(typedEmail);
  return (
    users.find(
      (user) =>
        normalizeEmail(user.email) === email ||
        user.emails.some(
          (entry) =>
            normalizeEmail(entry.email) === email && entry.verifiedAt !== null,
        ),
    ) ?? null
  );
}
