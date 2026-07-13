import { requireAdmin } from "@/server/auth/session";
import { handle, ok } from "@/server/http/respond";
import { getTreasuryReport } from "@/server/services/treasury/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/treasury — solvency summary + recent treasury flows. */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(await getTreasuryReport());
  });
}
