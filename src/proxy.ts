import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];

/**
 * First line of defence: coarse routing by session + role. Every page and
 * route handler re-checks authorization server-side against the database.
 */
export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const user = req.auth?.user;
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const home = user?.role === "ADMIN" ? "/admin/dashboard" : "/employee/dashboard";

  if (pathname === "/session-expired") return NextResponse.next();

  if (!user) {
    if (isPublic) return NextResponse.next();
    if (isApi) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (isPublic || pathname === "/") {
    return NextResponse.redirect(new URL(home, req.nextUrl));
  }

  if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL(home, req.nextUrl));
  }
  if (pathname.startsWith("/employee") && user.role !== "EMPLOYEE") {
    return NextResponse.redirect(new URL(home, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except static assets, Auth.js endpoints, and machine-to-machine
    // endpoints that authenticate themselves (signed webhooks, cron secret).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons|api/auth|api/payments/webhook|api/cron).*)",
  ],
};
