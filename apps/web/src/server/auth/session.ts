import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma, type User } from "@solrival/db";
import { SESSION_TTL_SECONDS, type SessionUser } from "@solrival/shared";
import { SESSION_COOKIE } from "./config";
import { signSession, verifySession } from "./jwt";

const baseCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Issues a session token and writes the httpOnly cookie onto a response. */
export async function attachSessionCookie(res: NextResponse, user: User): Promise<NextResponse> {
  const token = await signSession({ userId: user.id, wallet: user.walletAddress, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, { ...baseCookie, maxAge: SESSION_TTL_SECONDS });
  return res;
}

/** Clears the session cookie on a response (logout). */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { ...baseCookie, maxAge: 0 });
  return res;
}

/**
 * Loads the authenticated user from the session cookie + DB (Node runtime).
 * Returns null if unauthenticated or the account no longer exists. Suspended
 * users are treated as unauthenticated, giving immediate, JWT-independent
 * revocation on their next request.
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.suspended) return null;
  return user;
}

/** Like getCurrentUser but throws a 401-mapped error when absent. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", 401);
  return user;
}

/**
 * Requires an authenticated ADMIN for API route handlers.
 *
 * Cloaking: both "not signed in" and "signed in but not an admin" collapse to a
 * 404 (NotFoundError), so the admin API surface is indistinguishable from routes
 * that don't exist — a non-admin can't even detect it by probing. `handle()`
 * maps NotFoundError to a 404 response.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new NotFoundError();
  return user;
}

/**
 * Server-component variant for admin pages/layouts. Renders Next's built-in 404
 * (via notFound()) for any non-admin, so `/admin/*` pages look exactly like
 * non-existent routes in the browser too — no redirect, no hint of existence.
 */
export async function requireAdminPage(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();
  return user;
}

/** Maps a DB user to the safe public session shape returned to clients. */
export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    walletAddress: user.walletAddress,
    username: user.username,
    role: user.role,
    provider: user.walletProvider,
    wins: user.wins,
    losses: user.losses,
    suspended: user.suspended,
    createdAt: user.createdAt.toISOString(),
  };
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN",
    public status: number,
  ) {
    super(code);
    this.name = "AuthError";
  }
}

/**
 * Cloaked 404 for the admin surface. handle() maps `{ status, code }` errors to
 * an HTTP response, so this yields a 404 — identical to a route that doesn't
 * exist. Thrown by requireAdmin() for any non-admin (signed in or not).
 */
export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;
  constructor() {
    super("Not found");
    this.name = "NotFoundError";
  }
}
