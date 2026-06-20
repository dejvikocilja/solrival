import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/config";
import { verifySession } from "@/server/auth/jwt";

/**
 * Edge middleware. Only does JWT verification (jose is edge-safe) — NO database
 * access. Authoritative checks (suspension, current role) are re-validated in
 * Node route handlers / server components via requireUser/requireAdmin.
 *
 * Responsibilities:
 *  - /admin/*  : require a valid session with ADMIN role, else 404 (cloaked).
 *  - all matched: forward verified identity to handlers via request headers.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token) : null;

  const { pathname } = req.nextUrl;
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute && (!claims || claims.role !== "ADMIN")) {
    // Cloak the admin surface: a non-admin gets the SAME 404 as a route that
    // doesn't exist (no redirect, no ?auth hint), so /admin/* can't be found by
    // probing URLs. Rewriting to a non-existent path makes Next serve its
    // built-in 404 (404 status) while the URL bar stays unchanged. The admin
    // layout (notFound()) and every admin API (requireAdmin -> 404) enforce the
    // same cloak independently, in case middleware is ever bypassed.
    return NextResponse.rewrite(new URL("/_cloaked-not-found", req.url));
  }

  // Forward identity for downstream handlers (defense-in-depth; handlers still
  // verify independently). Strip any client-supplied spoof headers first.
  const headers = new Headers(req.headers);
  headers.delete("x-user-id");
  headers.delete("x-user-role");
  if (claims) {
    headers.set("x-user-id", claims.sub);
    headers.set("x-user-role", claims.role);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin/:path*", "/duels/:path*", "/tournaments/:path*", "/profile/:path*"],
};
