import { type NextRequest } from "next/server";
import { ledgerQuerySchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { getBalanceView, listLedger } from "@/server/services/credits/balance";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/balance — the caller's GGDUEL balance + recent ledger entries. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const q = ledgerQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const [balance, ledger] = await Promise.all([
      getBalanceView(user.id),
      listLedger(user.id, { cursor: q.cursor, limit: q.limit }),
    ]);
    return ok({ balance, ledger });
  });
}
