import { type NextRequest } from "next/server"
import { prisma, type DisputeStatus } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { handle, ok } from "@/server/http/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OPEN_STATUSES:     DisputeStatus[] = ["OPEN", "UNDER_REVIEW"]
const RESOLVED_STATUSES: DisputeStatus[] = [
  "RESOLVED_CREATOR_WIN",
  "RESOLVED_OPPONENT_WIN",
  "RESOLVED_REFUND",
  "REJECTED",
]

function serializeDispute(d: Record<string, unknown>) {
  const duel = d.duel as Record<string, unknown> | null | undefined
  return {
    ...d,
    duel: duel ? { ...duel, stakeLamports: (duel.stakeLamports as bigint | null)?.toString() ?? null } : duel,
  }
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin()

    const url          = new URL(req.url)
    const statusFilter = url.searchParams.get("status") ?? "open"
    const page         = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10))
    const limit        = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)))
    const skip         = (page - 1) * limit

    const statusIn =
      statusFilter === "open"     ? OPEN_STATUSES     :
      statusFilter === "resolved" ? RESOLVED_STATUSES :
      undefined // all

    const where = statusIn ? { status: { in: statusIn } } : {}

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: "desc" },
        include: {
          duel: {
            select: {
              id: true, shortCode: true, game: true, stakeLamports: true,
              creator:  { select: { username: true } },
              opponent: { select: { username: true } },
            },
          },
          raisedBy:        { select: { username: true } },
          resolvedByAdmin: { select: { username: true } },
        },
      }),
      prisma.dispute.count({ where }),
    ])

    return ok({
      data: disputes.map((d) => serializeDispute(d as unknown as Record<string, unknown>)),
      meta: { total, page, limit },
    })
  })
}
