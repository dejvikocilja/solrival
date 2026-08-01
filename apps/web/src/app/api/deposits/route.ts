import { type NextRequest } from "next/server";
import { confirmDepositSchema, ledgerQuerySchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { rateLimit } from "@/server/guards/rate-limit";
import { claimDeposit, depositConfig, listDeposits, toDepositView } from "@/server/services/deposit/service";
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
 * POST /api/deposits — claim an on-chain deposit by its signature.
 *
 * The signature is persisted immediately (DETECTED), then verified against the
 * chain and credited net of fee. Recording first is what makes a deposit
 * unlosable: the client may die at any point after broadcasting the transfer
 * and the sweep will still finish the job.
 *
 * 201 — credited. 202 — accepted, not yet finalized (crediting automatically).
 * Idempotent on the signature; re-posting can never double-credit.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();

    const rl = await rateLimit({ key: `deposit:${user.id}`, limit: 10, windowMs: 60_000 });
    if (!rl.ok) return fail("RATE_LIMITED", "Too many deposit confirmations — try again shortly", 429);

    const { signature } = confirmDepositSchema.parse(await req.json());
    const deposit = await claimDeposit(user, signature);
    return ok(
      { deposit: toDepositView(deposit) },
      { status: deposit.status === "CREDITED" ? 201 : 202 },
    );
  });
}
