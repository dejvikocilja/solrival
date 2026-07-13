import "server-only";

/**
 * Development scheduler.
 *
 * In production the three sweeps are driven by external cron jobs hitting the
 * `/api/internal/*` endpoints. In local development nothing calls them, so a
 * duel that passes its 30-minute window just sits there until someone runs a
 * curl by hand — which reads exactly like "the automatic refund is broken".
 *
 * This runs the same sweeps in-process on a timer so dev behaves like
 * production. It is a no-op when NODE_ENV === "production" (real cron owns it
 * there) and can be turned off with DEV_CRON=off.
 *
 * Intervals are deliberately slower than production's to keep dev logs quiet;
 * correctness doesn't depend on the period, only on the sweeps eventually
 * running.
 */

const VERIFY_INTERVAL_MS = 60_000; // production: ~30–60s
const EXPIRE_INTERVAL_MS = 120_000; // production: ~1–5min
const WITHDRAWAL_INTERVAL_MS = 120_000; // production: ~1–2min

/** Guards against double-registration across Next.js hot reloads. */
declare global {
  // eslint-disable-next-line no-var
  var __solrivalDevCron: boolean | undefined;
}

/** Runs a sweep, swallowing errors — a failed tick must never crash the server. */
async function safely(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    const result = await run();
    // Only log ticks that actually did something, so dev logs stay readable.
    if (result && typeof result === "object") {
      const values = Object.values(result as Record<string, unknown>);
      const didSomething = values.some((v) => typeof v === "number" && v > 0);
      if (didSomething) console.info({ msg: `dev_cron_${name}`, ...result });
    }
  } catch (err) {
    console.warn({ msg: `dev_cron_${name}_failed`, err: err instanceof Error ? err.message : String(err) });
  }
}

export function startDevCron(): void {
  if (process.env.NODE_ENV === "production") return;
  if (process.env["DEV_CRON"] === "off") return;
  if (globalThis.__solrivalDevCron) return; // already running (hot reload)
  globalThis.__solrivalDevCron = true;

  console.info({
    msg: "dev_cron_started",
    verifySec: VERIFY_INTERVAL_MS / 1000,
    expireSec: EXPIRE_INTERVAL_MS / 1000,
    withdrawalsSec: WITHDRAWAL_INTERVAL_MS / 1000,
    note: "dev only — production uses external cron. Disable with DEV_CRON=off",
  });

  setInterval(() => {
    void safely("verify", async () => {
      const { runVerificationSweep } = await import("@/server/services/duel/verification-sweep");
      return runVerificationSweep();
    });
  }, VERIFY_INTERVAL_MS).unref();

  setInterval(() => {
    void safely("expire", async () => {
      const { expireDuels } = await import("@/server/services/duel/service");
      return expireDuels();
    });
  }, EXPIRE_INTERVAL_MS).unref();

  setInterval(() => {
    void safely("withdrawals", async () => {
      const { processApprovedWithdrawals } = await import("@/server/services/withdrawal/service");
      return processApprovedWithdrawals();
    });
  }, WITHDRAWAL_INTERVAL_MS).unref();
}
