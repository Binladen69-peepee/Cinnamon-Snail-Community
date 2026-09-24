import { auth } from "@/auth";
import { addComment, listPostComments } from "@/lib/community/posts";
import { PermissionError } from "@/lib/community/engagement";
import { RateLimitedError } from "@/lib/community/rate-limits";
import { NextResponse } from "next/server";

/**
 * The inline comment panel's data.
 *
 * Reads take a cursor and a sort so the panel can page a long thread instead of
 * asking for all of it. Writes return the first page, which is what the panel
 * then shows.
 */

function statusFor(error: unknown): number {
  if (error instanceof RateLimitedError) return 429;
  if (error instanceof PermissionError) {
    const message = error.message.toLowerCase();
    if (message.includes("sign in")) return 401;
    if (message.includes("gone")) return 404;
    return 403;
  }
  return 400;
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: statusFor(error) });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const data = await listPostComments({
      userId: session.user.id,
      postId: id,
      sort: url.searchParams.get("sort") ?? undefined,
      cursor: url.searchParams.get("cursor"),
    });
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error, "Could not load comments.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as { body?: string; parentId?: string };
    await addComment({
      userId: session.user.id,
      postId: id,
      body: String(payload.body ?? ""),
      parentId: payload.parentId || null,
    });
    const data = await listPostComments({ userId: session.user.id, postId: id });
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error, "Could not post that comment.");
  }
}
