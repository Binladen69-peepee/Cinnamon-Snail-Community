"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  CrewError,
  joinOptionalCrew,
  leaveOptionalCrew,
  openCrewChat,
} from "@/lib/crews/membership";

/**
 * Crew actions: join or leave an opt-in crew, and open a crew's group chat.
 *
 * Plain form actions, so they work before hydration. Each one re-checks the
 * member on the server and is rate limited: joining and leaving in a loop is
 * a script, not a person. A refusal comes back as a code the page turns into
 * a sentence.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

async function viewerOrLogin(next: string) {
  const session = await auth();
  if (!session?.user.id) redirect(`/login?callbackUrl=${encodeURIComponent(next)}`);
  return session.user.id;
}

/** Back to where the button was: the crew page, the crews list, or Connect. */
function returnPath(raw: FormDataEntryValue | null, slug: string): string {
  const value = String(raw ?? "");
  if (value === "/connect") return "/connect";
  if (value === "/crews") return "/crews";
  return `/crews/${slug}`;
}

function anchorFor(path: string): string {
  return path === "/connect" ? "#crews" : "";
}

async function limited(userId: string): Promise<boolean> {
  const result = await consumeRateLimit(`crews:${userId}`, 30, 10 * 60 * 1000);
  return !result.ok;
}

function codeOf(error: unknown): string {
  if (error instanceof CrewError) return error.code;
  console.error("[crews] action failed", error);
  return "failed";
}

function refresh(slug: string) {
  revalidatePath("/crews");
  revalidatePath(`/crews/${slug}`);
  revalidatePath("/connect");
}

export async function joinCrewAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const back = returnPath(formData.get("returnTo"), slug);
  const userId = await viewerOrLogin(back);
  if (!SLUG.test(slug)) redirect(`${back}?error=not-found${anchorFor(back)}`);
  if (await limited(userId)) redirect(`${back}?error=busy${anchorFor(back)}`);

  let code: string | null = null;
  try {
    await joinOptionalCrew(userId, slug);
  } catch (error) {
    code = codeOf(error);
  }
  refresh(slug);
  redirect(
    code ? `${back}?error=${code}${anchorFor(back)}` : `${back}?joined=1${anchorFor(back)}`,
  );
}

export async function leaveCrewAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const back = returnPath(formData.get("returnTo"), slug);
  const userId = await viewerOrLogin(back);
  if (!SLUG.test(slug)) redirect(`${back}?error=not-found${anchorFor(back)}`);
  if (await limited(userId)) redirect(`${back}?error=busy${anchorFor(back)}`);

  let code: string | null = null;
  try {
    await leaveOptionalCrew(userId, slug);
  } catch (error) {
    code = codeOf(error);
  }
  refresh(slug);
  redirect(code ? `${back}?error=${code}${anchorFor(back)}` : `${back}?left=1${anchorFor(back)}`);
}

export async function openCrewChatAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const back = returnPath(formData.get("returnTo"), slug);
  const userId = await viewerOrLogin(back);
  if (!SLUG.test(slug)) redirect(`${back}?error=not-found${anchorFor(back)}`);
  if (await limited(userId)) redirect(`${back}?error=busy${anchorFor(back)}`);

  let conversationId: string | null = null;
  let code: string | null = null;
  try {
    conversationId = await openCrewChat(userId, slug);
  } catch (error) {
    code = codeOf(error);
  }
  if (!conversationId) redirect(`${back}?error=${code ?? "failed"}${anchorFor(back)}`);

  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}
