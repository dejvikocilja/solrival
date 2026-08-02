import { type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { handle, ok } from "@/server/http/respond";
import { getTreasuryReport, type FlowKind } from "@/server/services/treasury/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: readonly string[] = ["DEPOSIT", "WITHDRAWAL", "DUEL_RAKE"];

/**
 * GET /api/admin/treasury — solvency summary, on-chain reconciliation, and a
 * paged slice of treasury movements.
 *
 * `?page=1&pageSize=20&kind=DEPOSIT&from=2026-07-01&to=2026-07-31`
 * Unrecognised filter values are ignored rather than rejected, so a stale
 * bookmark degrades to the default view instead of erroring.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();

    const p = req.nextUrl.searchParams;
    const rawKind = p.get("kind");

    return ok(
      await getTreasuryReport({
        page: Number(p.get("page")) || 1,
        pageSize: Number(p.get("pageSize")) || undefined,
        kind: rawKind && KINDS.includes(rawKind) ? (rawKind as FlowKind) : "ALL",
        from: p.get("from") ?? undefined,
        to: p.get("to") ?? undefined,
      }),
    );
  });
}
