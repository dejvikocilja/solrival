import "server-only";

/**
 * Fixed-window rate limiter.
 *
 * NOTE: the in-memory store below does NOT share state across serverless
 * instances. It is correct for a single node and as a dev default; in
 * production back this with Redis/Upstash (or a Postgres counter) by swapping
 * the `RateStore` implementation. The auth endpoints are the primary consumers.
 */
export interface RateStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryStore implements RateStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    // H-008: Evict expired buckets every 5 minutes to prevent unbounded growth
    // under sustained unique-IP traffic (e.g. bot sweeps).
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, b] of this.buckets) {
        if (b.resetAt <= now) this.buckets.delete(key);
      }
    }, 5 * 60_000);
    // Allow Node to exit even if the interval is running.
    if (cleanup.unref) cleanup.unref();
  }

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    b.count += 1;
    return b;
  }
}

/**
 * Distributed fixed-window store backed by Upstash Redis (REST). Shared across
 * all serverless instances, so limits hold on Vercel/multi-node. Selected
 * automatically when UPSTASH_REDIS_REST_URL + _TOKEN are set; otherwise the
 * in-memory store is used (fine for a single node / local dev).
 *
 * Atomic per hit via a pipeline: INCR, set the window TTL only on the first hit
 * (PEXPIRE … NX), then read the remaining TTL for resetAt.
 */
class UpstashStore implements RateStore {
  constructor(
    private url: string,
    private token: string,
  ) {}

  async hit(key: string, windowMs: number) {
    const namespaced = `rl:${key}`;
    try {
      const res = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify([
          ["INCR", namespaced],
          ["PEXPIRE", namespaced, windowMs, "NX"],
          ["PTTL", namespaced],
        ]),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`upstash ${res.status}`);
      const out = (await res.json()) as Array<{ result: number }>;
      const count = Number(out[0]?.result ?? 1);
      const pttl = Number(out[2]?.result ?? windowMs);
      return { count, resetAt: Date.now() + (pttl > 0 ? pttl : windowMs) };
    } catch {
      // Fail open on transport errors — never block legitimate traffic because
      // the limiter backend hiccuped. The memory store still applies per-node.
      return { count: 1, resetAt: Date.now() + windowMs };
    }
  }
}

function makeStore(): RateStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashStore(url, token);
  return new MemoryStore();
}

const store: RateStore = makeStore();

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const { count, resetAt } = await store.hit(opts.key, opts.windowMs);
  return { ok: count <= opts.limit, remaining: Math.max(0, opts.limit - count), resetAt };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
