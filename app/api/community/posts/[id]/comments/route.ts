import { auth } from "@/auth";
import { addComment, listPostComments } from "@/lib/community/posts";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "You need to sign in." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const data = await listPostComments(session.user.id, id);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load comments.";
    const status = message.includes("sign in") ? 401 : message.includes("cannot") ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
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
      parentId: payload.parentId || undefined,
    });
    const data = await listPostComments(session.user.id, id);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not post that comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
