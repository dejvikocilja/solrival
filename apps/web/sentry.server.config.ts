/**
 * Sentry — Node server runtime. Initialized from instrumentation.ts on boot.
 * Fully inert unless SENTRY_DSN is set, so dev/staging without a DSN behaves
 * exactly as before.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // Error tracking is the goal; keep performance tracing off until needed so
  // the free quota goes entirely to errors on the money paths.
  tracesSampleRate: 0,
});
