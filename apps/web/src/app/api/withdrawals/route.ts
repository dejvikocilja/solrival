import { type NextRequest } from "next/server";
import { createWithdrawalSchema, ledgerQuerySchema } from "@solrival/shared";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { rateLimit } from "@/server/guards/rate-limit";
import {
  listUserWithdrawals,
  requestWithdrawal,
  toWithdrawalView,
} from "@/server/services/withdrawal/service";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/withdrawals — the caller's withdrawal history. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const q = ledgerQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    return ok(await listUserWithdrawals(user.id, { cursor: q.cursor, limit: q.limit }));
  });
}

/**
 * POST /api/withdrawals — request a withdrawal. Funds are locked immediately;
 * auto-approved unless the user has an active dispute (then held for admin).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();

    const rl = await rateLimit({ key: `withdraw:${user.id}`, limit: 5, windowMs: 60_000 });
    if (!rl.ok) return fail("RATE_LIMITED", "Too many withdrawal requests — try again shortly", 429);

    const input = createWithdrawalSchema.parse(await req.json());
    const withdrawal = await requestWithdrawal(user, input.amountLamports, input.destinationWallet);
    return ok(
      {
        withdrawal: toWithdrawalView(withdrawal),
        autoApproved: withdrawal.autoApproved,
        message: withdrawal.autoApproved
          ? "Withdrawal approved and queued for payout."
          : "Withdrawal received. It needs manual review because you have an active dispute.",
      },
      { status: 201 },
    );
  });
}
