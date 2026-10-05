"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  ChallengeError,
  joinChallenge,
  leaveChallenge,
  markPromptDone,
  unmarkPromptDone,
} from "@/lib/challenges";

/**
 * Challenge actions. Plain forms, so they work before hydration.
 *
 * A refusal the member can act on comes back as a code in the URL, which the
 * page turns into a sentence; anything else is a real fault and is logged.
 */
async function viewerOrLogin(slug: string) {
  const session = await auth();
  if (!session?.user.id) redirect(`/login?callbackUrl=/challenges/${slug}`);
  return session.user.id;
}

async function run(userId: string, slug: string, work: () => Promise<string | void>) {
  const limit = await consumeRateLimit(`challenge:${userId}`, 120, 10 * 60 * 1000);
  if (!limit.ok) redirect(`/challenges/${slug}?error=busy`);

  let code: string | null = null;
  let suffix = "";
  try {
    suffix = (await work()) ?? "";
  } catch (error) {
    if (error instanceof ChallengeError) code = error.code;
    else {
      console.error("[challenges] action failed", error);
      code = "failed";
    }
  }
  revalidatePath("/challenges");
  revalidatePath(`/challenges/${slug}`);
  redirect(code ? `/challenges/${slug}?error=${code}` : `/challenges/${slug}${suffix}`);
}

const text = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").slice(0, max);

export async function joinAction(form: FormData) {
  const slug = text(form, "slug", 120);
  const userId = await viewerOrLogin(slug);
  await run(userId, slug, () => joinChallenge(userId, slug));
}

export async function leaveAction(form: FormData) {
  const slug = text(form, "slug", 120);
  const userId = await viewerOrLogin(slug);
  await run(userId, slug, () => leaveChallenge(userId, slug));
}

export async function markDoneAction(form: FormData) {
  const slug = text(form, "slug", 120);
  const userId = await viewerOrLogin(slug);
  await run(userId, slug, async () => {
    const result = await markPromptDone({
      userId,
      slug,
      promptId: text(form, "promptId", 64),
      note: text(form, "note") || null,
    });
    return result.justCompleted ? "?done=challenge" : "?done=day";
  });
}

export async function unmarkDoneAction(form: FormData) {
  const slug = text(form, "slug", 120);
  const userId = await viewerOrLogin(slug);
  await run(userId, slug, async () => {
    await unmarkPromptDone({ userId, slug, promptId: text(form, "promptId", 64) });
  });
}
