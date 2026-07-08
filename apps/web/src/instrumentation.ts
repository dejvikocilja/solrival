/**
 * Next.js instrumentation — runs once when the server boots.
 *
 * 1. Fail-fast env validation in production: a deploy with a missing required
 *    variable dies at startup with a complete list of what's absent, instead
 *    of 500-ing on whichever route first touches it. Development is exempt so
 *    features degrade independently while credentials are filled in.
 * 2. Sentry initialization per runtime (inert when SENTRY_DSN is unset), plus
 *    onRequestError so server-side route errors are captured — a silent 500
 *    on a payout path is money.
 */
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production") {
      const { validateEnv } = await import("@/lib/env");
      validateEnv();
    }
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
