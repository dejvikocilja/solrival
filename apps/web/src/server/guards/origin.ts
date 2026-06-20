import "server-only";
import { authConfig } from "../auth/config";

/**
 * Defense-in-depth CSRF guard for state-changing requests. SameSite=Lax cookies
 * already block most cross-site POSTs; this additionally rejects requests whose
 * Origin (or Referer fallback) host doesn't match the app host.
 */
export function assertSameOrigin(req: Request): void {
  const appHost = new URL(authConfig.appUrl).host;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin ?? referer;

  // Allow same-origin server-to-server / non-browser calls that omit both.
  if (!source) return;

  try {
    if (new URL(source).host !== appHost) {
      throw new CsrfError();
    }
  } catch (e) {
    if (e instanceof CsrfError) throw e;
    throw new CsrfError();
  }
}

export class CsrfError extends Error {
  status = 403;
  code = "CSRF_REJECTED";
  constructor() {
    super("Cross-origin request rejected");
    this.name = "CsrfError";
  }
}
