import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const memberPrefixes = [
  "/home",
  "/spaces",
  "/posts",
  "/compose",
  "/members",
  "/learn",
  "/roadmap",
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
  const { pathname } = req.nextUrl;
  const needsAuth = memberPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (needsAuth && !hasSessionCookie(req)) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|uploads|images|avatars|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
