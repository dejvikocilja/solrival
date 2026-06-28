import { type NextRequest } from "next/server"
import { prisma } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { handle, ok, fail } from "@/server/http/respond"
import { refundCreditDuel } from "@/server/services/duel/credit-duel"
import { applyVerifiedWinner } from "@/server/services/duel/settlement"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSchema = z.object({
  action: z.enum(["force-refund", "force-settle"]),
  winner: z.enum(["creator", "opponent"]).optional(),
})

function serializeDuel(d: Record<string, unknown>) {
  return {
    ...d,
    stakeLamports:        (d.stakeLamports as bigint | null)?.toString()        ?? null,
    winnerPayoutLamports: (d.winnerPayoutLamports as bigint | null)?.toString() ?? null,
    feeCollectedLamports: (d.feeCollectedLamports as bigint | null)?.toString() ?? null,
    escrowTransactions:   Array.isArray(d.escrowTransactions)
      ? (d.escrowTransactions as Array<Record<string, unknown>>).map((tx) => ({
          ...tx,
          amountLamports: (tx.amountLamports as bigint | null)?.toString() ?? null,
          slot:           (tx.slot as bigint | null)?.toString()            ?? null,
        }))
      : undefined,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin()
    const { id } = await params

    const duel = await prisma.duel.findUnique({
      where: { id },
      include: {
        creator:  { select: { id: true, username: true, walletAddress: true } },
        opponent: { select: { id: true, username: true, walletAddress: true } },
        winner:   { select: { id: true, username: true, walletAddress: true } },
        rule:     true,
        verificationJob: true,
        dispute:  true,
        escrowTransactions: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!duel) return fail("NOT_FOUND", "Duel not found", 404)
    return ok({ data: serializeDuel(duel as unknown as Record<string, unknown>) })
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin()
    const { id }   = await params
    const body     = patchSchema.parse(await req.json())

    const duel = await prisma.duel.findUnique({ where: { id } })
    if (!duel) return fail("NOT_FOUND", "Duel not found", 404)


    if (body.action === "force-refund") {
      if (duel.status === "REFUNDED") {
        return fail("INVALID_STATUS", "Duel is already refunded", 409)
      }

      // H-011: On-chain (escrow) duels must be unwound on-chain first. While a
      // PDA is still set we cannot safely mark the duel refunded here, because
      // the lamports may remain locked on-chain. Block it and require the
      // on-chain refund path so funds are never double-counted.
      if (duel.escrowPda) {
        return fail(
          "ON_CHAIN_REFUND_REQUIRED",
          "This duel is escrowed on-chain; unwind it via the on-chain tooling before changing its status.",
          409,
        )
      }

      // Credit duels: atomically return both players' locked stakes to available
      // and mark the duel REFUNDED (idempotent).
      const refunded = await refundCreditDuel(id)
      return ok({ data: serializeDuel(refunded as unknown as Record<string, unknown>) })
    }
    if (body.action === "force-settle") {
      // Manual settlement override standing in for the IP-locked verifier
      // (Phase 6). Pays the chosen winner the full pot via the exact path the
      // verifier uses (applyVerifiedWinner -> settleCreditDuel). Idempotent.
      if (duel.escrowPda) {
        return fail("ON_CHAIN_REFUND_REQUIRED", "This duel is escrowed on-chain; settle it via on-chain tooling.", 409)
      }
      if (!duel.opponentId) return fail("NO_OPPONENT", "Duel has no opponent to settle", 409)
      if (!body.winner) return fail("BAD_WINNER", "Specify the winner (creator or opponent)", 400)
      const winnerId = body.winner === "creator" ? duel.creatorId : duel.opponentId
      const settled = await applyVerifiedWinner(id, winnerId)
      return ok({ data: serializeDuel(settled as unknown as Record<string, unknown>) })
    }
    
    return fail("INVALID_ACTION", "Unknown action", 400)
  })
}