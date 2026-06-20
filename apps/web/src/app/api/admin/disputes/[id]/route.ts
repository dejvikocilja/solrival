import { type NextRequest } from "next/server"
import { prisma } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { resolveDisputeSettlement } from "@/server/services/duel/settlement"
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

    // Move the money first: settle the winner or refund both players (credits or
    // on-chain, per the duel's funding mode). Idempotent — safe if retried.
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

    return ok({ data: updated })
  })
}
