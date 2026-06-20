import { type NextRequest } from "next/server";
import { confirmDepositSchema, ledgerQuerySchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { rateLimit } from "@/server/guards/rate-limit";
import { confirmDeposit, depositConfig, listDeposits, toDepositView } from "@/server/services/deposit/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/deposits — treasury address + deposit fee, plus the caller's history. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const q = ledgerQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const history = await listDeposits(user.id, { cursor: q.cursor, limit: q.limit });
    return ok({ config: depositConfig(), ...history });
  });
}

/**
 * POST /api/deposits — confirm an on-chain deposit by its signature. The server
 * verifies the transfer against the chain and credits the balance net of fee.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();

    const rl = await rateLimit({ key: `deposit:${user.id}`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) return fail("RATE_LIMITED", "Too many deposit confirmations — try again shortly", 429);

    const { signature } = confirmDepositSchema.parse(await req.json());
    const deposit = await confirmDeposit(user, signature);
    return ok({ deposit: toDepositView(deposit) }, { status: 201 });
  });
}
