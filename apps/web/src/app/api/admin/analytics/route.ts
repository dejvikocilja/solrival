import { type NextRequest } from "next/server"
import { requireAdmin } from "@/server/auth/session"
import { handle, ok, fail } from "@/server/http/respond"
import {
  AnalyticsRangeError,
  getAnalyticsSnapshot,
} from "@/server/services/admin/analytics"
import { rangeFromParams, rangeLabel } from "@/lib/admin/analytics-range"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/analytics — dashboard snapshot for a time range.
 *
 * `?range=7d|14d|30d|90d|all`, or `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * Unrecognised values fall back to the default rather than erroring, so a
 * stale bookmark still renders. Polled by the dashboard, so it stays cheap:
 * every figure is aggregated in SQL, nothing is materialised in memory.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin()

    const selection = rangeFromParams(req.nextUrl.searchParams)
    try {
      const data = await getAnalyticsSnapshot(selection, rangeLabel(selection))
      return ok({ data })
    } catch (e) {
      if (e instanceof AnalyticsRangeError) return fail(e.code, e.message, e.status)
      throw e
    }
  })
}
