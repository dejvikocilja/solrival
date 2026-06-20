import "server-only"

/** UUID v4 regex used to validate path parameters before hitting Prisma. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Returns `true` when `value` is a valid UUID.
 * Use this to guard `[duelId]` path segments — prevents Prisma
 * `PrismaClientValidationError` (which maps to a 500) for malformed inputs.
 *
 * M-001 audit finding.
 */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value)
}
