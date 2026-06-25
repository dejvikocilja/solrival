import "server-only";
import { authConfig } from "../auth/config";

/**
 * Defense-in-depth CSRF guard for state-changing requests.
 *
 * Primary signal: Sec-Fetch-Site (Fetch Metadata). Browser-set, unforgeable by
 * page script, and — unlike Origin — not rewritten by reverse proxies that
 * rebind the upstream host. (GitHub Codespaces forwards the public
 * *.app.github.dev origin to http://localhost:3000 and rewrites the Origin
 * header to that internal address; Referer and Sec-Fetch-Site pass through.)
 *
 * Fallback (clients without Fetch Metadata): Origin OR Referer host must match
 * the allowlist — checking both tolerates the mangled Origin via a good Referer.
 */
export function assertSameOrigin(req: Request): void {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite) {
    // same-origin: our own page. none: direct navigation / non-browser client.
    if (secFetchSite === "same-origin" || secFetchSite === "none") return;
    throw new CsrfError(); // cross-site / same-site → reject
  }

  const allowed = allowedHosts();
  const candidates = [req.headers.get("origin"), req.headers.get("referer")]
    .filter((v): v is string => Boolean(v));
  if (candidates.length === 0) return; // non-browser / same-origin server call

  for (const c of candidates) {
    try {
      if (allowed.has(new URL(c).host)) return;
    } catch {
      /* malformed header — try the next candidate */
    }
  }
  throw new CsrfError();
}

function allowedHosts(): Set<string> {
  const hosts = new Set<string>([new URL(authConfig.appUrl).host]);
  if (process.env.NODE_ENV !== "production") {
    for (const h of (process.env.CSRF_DEV_ALLOWED_HOSTS ?? "localhost:3000")
      .split(",").map((s) => s.trim()).filter(Boolean)) {
      hosts.add(h);
    }
  }
  return hosts;
}

export class CsrfError extends Error {
  status = 403;
  code = "CSRF_REJECTED";
  constructor() {
    super("Cross-origin request rejected");
    this.name = "CsrfError";
  }
}