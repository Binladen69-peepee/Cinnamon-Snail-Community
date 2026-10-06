import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Everything signed in. `/home`, `/spaces` and `/calendar` stay listed even
 * though next.config.ts redirects them first (to the Kitchen Table and Live
 * Classes): the redirect table runs before this, but a space's settings and
 * review pages still live under `/spaces`.
 */
const memberPrefixes = [
  "/kitchen-table",
  "/home",
  "/spaces",
  "/posts",
  "/compose",
  "/drafts",
  "/members",
  "/connect",
  "/crews",
  "/learn",
  "/live-classes",
  "/roadmap",
  "/ideas",
  "/challenges",
  "/calendar",
  "/bulletin",
  "/messages",
  "/search",
  "/notifications",
  "/settings",
  "/billing",
  "/admin",
];

function hasSessionCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get("authjs.session-token") ??
      req.cookies.get("__Secure-authjs.session-token"),
  );
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const needsAuth = memberPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (needsAuth && !hasSessionCookie(req)) {
    const login = new URL("/login", req.nextUrl);
    // The query comes along, so a link to one view (a Reels feed, a filtered
    // directory) lands on that view after signing in, not on its default.
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|images|avatars|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
