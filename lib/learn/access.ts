import { userHasActiveEntitlement } from "@/lib/entitlements/server";

export async function memberCanPlayLessons(userId: string) {
  return userHasActiveEntitlement(userId);
}
