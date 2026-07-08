/**
 * Test stub for `@solrival/db`. Server modules import `prisma` (the client
 * singleton) and `Prisma` (the generated namespace) at module scope; neither
 * may be touched in unit tests — ledger tests drive `applyEntry` through an
 * in-memory fake TransactionClient instead. Any accidental use of the real
 * client in a unit test throws loudly rather than silently hitting a DB.
 */

function explode(name: string): never {
  throw new Error(`[test] ${name} must not be used in unit tests — pass a fake Tx instead`);
}

export const prisma: Record<string, unknown> = new Proxy(
  {},
  { get: (_t, prop) => (prop === "then" ? undefined : explode(`prisma.${String(prop)}`)) },
);

export const Prisma = {
  // Referenced in instanceof checks; a class no real error will ever be.
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
};
