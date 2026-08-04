import "server-only";

/**
 * Date-range filtering for admin list endpoints.
 *
 * Every admin table grows without bound, so pagination alone isn't enough: an
 * operator looking for what happened during a specific incident should not have
 * to click through pages of unrelated rows. A single shared parser keeps the
 * query contract (`?from=&to=`) identical across duels, disputes, withdrawals,
 * verification, tournaments, and treasury.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRangeFilter {
  gte?: Date;
  lte?: Date;
}

function parseDay(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const iso = endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Rejects overflow dates like 2026-02-31, which Date silently rolls forward.
  if (d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

/**
 * Builds a Prisma date filter from `?from=`/`?to=` query params.
 *
 * Bounds are inclusive whole days in UTC — an operator filtering "to
 * 2026-07-31" means through the end of the 31st, not midnight at its start.
 * Malformed values are ignored rather than rejected: a stale bookmark should
 * degrade to a wider result set, never a 400.
 *
 * Returns undefined when neither bound is usable, so it can be spread into a
 * `where` clause without adding an empty object.
 */
export function parseDateRange(params: URLSearchParams): DateRangeFilter | undefined {
  const gte = parseDay(params.get("from"), false);
  const lte = parseDay(params.get("to"), true);

  if (!gte && !lte) return undefined;
  // An inverted range would silently return nothing; drop the upper bound so
  // the operator sees results and can spot their mistake.
  if (gte && lte && gte > lte) return { gte };

  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  };
}
