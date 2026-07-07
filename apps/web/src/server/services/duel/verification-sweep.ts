import "server-only";
import { prisma } from "@solrival/db";
import { verifyDuelOnce } from "@/api/verification/verify";

/**
 * Verification sweep — the production driver for automated settlement.
 *
 * Finds every live duel (ACTIVE / VERIFYING) and runs ONE verification attempt
 * each via `verifyDuelOnce`, which settles the winner the moment a matching
 * battle appears, or disputes the duel once its window expires. Designed to be
 * invoked frequently by a scheduler (POST /api/internal/duels/verify) rather
 * than relying on a long-lived in-process poller, so it works on serverless and
 * survives restarts.
 *
 * MUST run on the static-egress host: each attempt calls the Supercell API,
 * whose tokens are IP-whitelisted.
 */
export async function runVerificationSweep(limit = 25): Promise<{
  checked: number;
  verified: number;
  disputed: number;
  refunded: number;
  pending: number;
  errored: number;
}> {
  const duels = await prisma.duel.findMany({
    where: { status: { in: ["ACTIVE", "VERIFYING"] }, opponentId: { not: null } },
    orderBy: { activatedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let verified = 0;
  let disputed = 0;
  let refunded = 0;
  let pending = 0;
  let errored = 0;

  for (const { id } of duels) {
    try {
      const result = await verifyDuelOnce(id);
      if (result.status === "verified") verified += 1;
      else if (result.status === "refunded") refunded += 1;
      else if (result.status === "timeout" || result.status === "disputed") disputed += 1;
      else if (result.status === "error") errored += 1;
      else pending += 1;
    } catch (e) {
      errored += 1;
      console.error({
        msg: "verification_sweep_duel_failed",
        duelId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { checked: duels.length, verified, disputed, refunded, pending, errored };
}
