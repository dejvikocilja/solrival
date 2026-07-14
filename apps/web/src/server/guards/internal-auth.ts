import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time bearer-token check for internal / keeper endpoints.
 *
 * Using `timingSafeEqual` (rather than `===`/`!==`) avoids leaking the secret
 * one byte at a time through response-timing side channels. Each internal
 * endpoint passes its OWN secret so a leak of one keeper token can't be replayed
 * against another (e.g. the duel-expiry cron must not unlock treasury payouts).
 */
export function isAuthorizedInternal(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const secret = Buffer.from(expected);
  // Length check first — timingSafeEqual throws on length mismatch.
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(provided, secret);
}

/**
 * Authorizes a scheduled sweep.
 *
 * Accepts EITHER the endpoint's own secret (used by manual invocations and any
 * external keeper, so each endpoint stays independently rotatable) OR the
 * hosting platform's cron secret. Vercel Cron, for example, calls the endpoint
 * with `Authorization: Bearer $CRON_SECRET` and cannot be given a per-route
 * header — without this the platform scheduler could never authenticate.
 *
 * Both checks are constant-time, and an unset secret always fails closed, so a
 * deployment that forgets CRON_SECRET simply can't be driven by the platform
 * scheduler rather than becoming publicly triggerable.
 */
export function isAuthorizedCron(req: Request, endpointSecret: string | undefined): boolean {
  return (
    isAuthorizedInternal(req, endpointSecret) ||
    isAuthorizedInternal(req, process.env["CRON_SECRET"])
  );
}
