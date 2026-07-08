import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit-test config. Two aliases make server modules importable outside Next:
 *  - `server-only` (throws outside a React Server environment) → no-op stub
 *  - `@solrival/db` (instantiates the Prisma client) → inert stub; the ledger
 *    tests drive `applyEntry` through an in-memory fake TransactionClient, so
 *    no database is touched.
 * The `@/` path alias mirrors tsconfig.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: path.resolve(__dirname, "src/test/stubs/server-only.ts") },
      { find: "@solrival/db", replacement: path.resolve(__dirname, "src/test/stubs/solrival-db.ts") },
      { find: /^@\//, replacement: `${path.resolve(__dirname, "src")}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
