import { type NextRequest } from "next/server"
import { prisma } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { resolveDisputeSettlement } from "@/server/services/duel/settlement"
import { publishDisputeResolved } from "@/lib/realtime/event-publisher"
import { handle, ok, fail } from "@/server/http/respond"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSchema = z.object({
  resolution: z.string().min(1, "Resolution notes are required"),
  outcome: z
    .enum(["RESOLVED_CREATOR_WIN", "RESOLVED_OPPONENT_WIN", "RESOLVED_REFUND", "REJECTED"])
    .default("RESOLVED_REFUND"),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin()
    const { id } = await params
    const body   = patchSchema.parse(await req.json())

    const existing = await prisma.dispute.findUnique({ where: { id } })
    if (!existing) return fail("NOT_FOUND", "Dispute not found", 404)
    if (!["OPEN", "UNDER_REVIEW"].includes(existing.status)) {
      return fail("ALREADY_RESOLVED", "Dispute is already resolved", 409)
    }

    // Move the money first: settle the winner or refund both players — or, for
    // a dispute raised against an already-settled result, uphold / overturn /
    // void it (see resolveDisputeSettlement). Idempotent — safe if retried. A
    // clawback the original winner's balance can't cover surfaces here as a
    // 409 (their withdrawals are frozen while the dispute is open, so waiting
    // or resolving their other duels first always unblocks it).
    await resolveDisputeSettlement(existing.duelId, body.outcome)

    const updated = await prisma.dispute.update({
      where: { id },
      data: {
        status:           body.outcome,
        resolutionNotes:  body.resolution,
        resolvedByAdminId: admin.id,
        resolvedAt:       new Date(),
      },
      include: {
        duel:            { select: { id: true, shortCode: true, game: true, status: true } },
        resolvedByAdmin: { select: { username: true } },
      },
    })

    // Audit trail for the fund-moving decision.
    await prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "DISPUTE_RESOLVED",
        entityType: "Dispute",
        entityId: id,
        metadata: { outcome: body.outcome, duelId: existing.duelId, notes: body.resolution },
      },
    })

    // Tell both players how it was resolved (post-commit; the bell is often the
    // only signal — the counterparty may not be watching the duel page).
    const participants = await prisma.duel.findUnique({
      where: { id: existing.duelId },
      select: {
        creatorId: true,
        opponentId: true,
        winner: { select: { username: true } },
      },
    })
    if (participants) {
      const winnerTag = participants.winner?.username ?? null
      for (const targetUserId of [participants.creatorId, participants.opponentId]) {
        if (!targetUserId) continue
        publishDisputeResolved({
          duelId: existing.duelId,
          resolution: body.outcome,
          winnerTag,
          targetUserId,
        })
      }
    }

    return ok({ data: updated })
  })
}
