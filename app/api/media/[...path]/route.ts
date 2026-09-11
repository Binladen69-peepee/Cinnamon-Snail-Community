import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { objectPathFromUrl, signedReadUrl, MEDIA_ROUTE } from "@/lib/uploads/storage";

/**
 * Read one member upload.
 *
 * The bucket is private, so this is the only way in. It checks the session,
 * then redirects to a short-lived signed URL — the bytes come from Supabase's
 * CDN straight to the browser, so we handle a redirect per image rather than
 * proxying the image itself.
 *
 * Redirecting also keeps expiring URLs out of the database: the attachment row
 * stores this stable path, and the signature is minted per request.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    // Community media sits behind the paywall, like the rest of the app.
    return new NextResponse("Sign in to view this.", { status: 401 });
  }

  const { path } = await context.params;
  // Re-use the same validator the attachment field uses, so "what is a legal
  // object key" is defined in exactly one place.
  const key = objectPathFromUrl(`${MEDIA_ROUTE}/${path.join("/")}`);
  if (!key) return new NextResponse("Not found.", { status: 404 });

  const url = await signedReadUrl(key);
  if (!url) return new NextResponse("Not found.", { status: 404 });

  return NextResponse.redirect(url, {
    status: 307,
    headers: {
      // Private: the signature is per-member-session, so a shared cache must
      // not hand one member's redirect to another.
      "Cache-Control": "private, max-age=300",
    },
  });
}
