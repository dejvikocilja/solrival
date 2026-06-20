import { type NextRequest } from "next/server"
import { prisma, type DuelStatus, type Game } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { handle, ok } from "@/server/http/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Map admin filter strings to DB enum arrays
const STATUS_FILTER_MAP: Record<string, DuelStatus[]> = {
  open:      ["WAITING_FOR_OPPONENT"],
  pending:   ["CREATED", "ACCEPTED"],
  active:    ["ACTIVE", "VERIFYING"],
  completed: ["COMPLETED"],
  cancelled: ["CANCELLED", "EXPIRED", "REFUNDED"],
  disputed:  ["DISPUTED"],
}

const GAME_FILTER_MAP: Record<string, Game> = {
  "clash-royale": "CLASH_ROYALE",
  "brawl-stars":  "BRAWL_STARS",
  CLASH_ROYALE:   "CLASH_ROYALE",
  BRAWL_STARS:    "BRAWL_STARS",
}

function serializeDuel(d: Record<string, unknown>) {
  return {
    ...d,
    stakeLamports:         (d.stakeLamports as bigint | null)?.toString()         ?? null,
    winnerPayoutLamports:  (d.winnerPayoutLamports as bigint | null)?.toString()  ?? null,
    feeCollectedLamports:  (d.feeCollectedLamports as bigint | null)?.toString()  ?? null,
  }
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin()

    const url          = new URL(req.url)
    const statusFilter = url.searchParams.get("status") ?? "all"
    const gameFilter   = url.searchParams.get("game")   ?? "all"
    const page         = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10))
    const limit        = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)))
    const skip         = (page - 1) * limit

    const statusIn = statusFilter !== "all" ? STATUS_FILTER_MAP[statusFilter] : undefined
    const gameIn   = gameFilter   !== "all" ? GAME_FILTER_MAP[gameFilter]     : undefined

    const where = {
      ...(statusIn ? { status: { in: statusIn } } : {}),
      ...(gameIn   ? { game: gameIn }              : {}),
    }

    const [duels, total] = await Promise.all([
      prisma.duel.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: "desc" },
        include: {
          creator:  { select: { id: true, username: true, walletAddress: true } },
          opponent: { select: { id: true, username: true, walletAddress: true } },
          rule:     { select: { displayName: true, template: true } },
          verificationJob: { select: { status: true, attempts: true, completedAt: true } },
          dispute:  { select: { id: true, status: true } },
        },
      }),
      prisma.duel.count({ where }),
    ])

    return ok({ data: duels.map((d) => serializeDuel(d as unknown as Record<string, unknown>)), meta: { total, page, limit } })
  })
}
