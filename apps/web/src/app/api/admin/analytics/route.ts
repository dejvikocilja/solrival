import { type NextRequest } from "next/server"
import { prisma } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { handle, ok } from "@/server/http/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LAMPORTS_PER_SOL = 1_000_000_000n

export interface AnalyticsSnapshot {
  totalDuels:       number
  activeDuels:      number
  totalVolumeSol:   number
  feesCollectedSol: number
  totalTournaments: number
  activePlayers30d: number
  duelsPerDay:      { date: string; count: number }[]
  volumePerDay:     { date: string; sol: number }[]
  winRateByGame:    { gameId: string; totalMatches: number; p1WinRate: number }[]
}

export async function GET(_req: NextRequest) {
  return handle(async () => {
    await requireAdmin()

    const now             = new Date()
    const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    const [
      totalDuels,
      activeDuels,
      totalTournaments,
      volumeResult,
      activePlayersResult,
      recentDuelsForChart,
      winRateRows,
    ] = await Promise.all([
      prisma.duel.count(),
      prisma.duel.count({ where: { status: { in: ["ACTIVE", "VERIFYING"] } } }),
      prisma.tournament.count(),

      // H-003: aggregate volume/fees in SQL — avoids loading all rows into memory.
      prisma.$queryRaw<[{ total_volume: bigint; total_fees: bigint }]>`
        SELECT
          COALESCE(SUM(stake_lamports * 2), 0)::bigint    AS total_volume,
          COALESCE(SUM(fee_collected_lamports), 0)::bigint AS total_fees
        FROM duels
        WHERE status = 'COMPLETED'
      `,

      // H-012: active distinct players via SQL COUNT(DISTINCT) — not in-memory Set.
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(DISTINCT player_id)::bigint AS cnt
        FROM (
          SELECT creator_id  AS player_id FROM duels WHERE created_at >= ${thirtyDaysAgo}
          UNION ALL
          SELECT opponent_id AS player_id FROM duels WHERE created_at >= ${thirtyDaysAgo} AND opponent_id IS NOT NULL
        ) sub
      `,

      prisma.duel.findMany({
        where:   { createdAt: { gte: fourteenDaysAgo } },
        select:  { createdAt: true, stakeLamports: true },
        orderBy: { createdAt: "asc" },
      }),

      // L-001: real win-rate query instead of hardcoded 0.5.
      prisma.$queryRaw<{ game: string; total: bigint; wins: bigint }[]>`
        SELECT
          game,
          COUNT(*)::bigint                                              AS total,
          COUNT(*) FILTER (WHERE winner_id = creator_id)::bigint       AS wins
        FROM duels
        WHERE status = 'COMPLETED'
        GROUP BY game
      `,
    ])

    const totalVolumeLamports   = volumeResult[0]?.total_volume  ?? 0n
    const feesCollectedLamports = volumeResult[0]?.total_fees    ?? 0n
    const activePlayers30d      = Number(activePlayersResult[0]?.cnt ?? 0n)

    // H-005: keep arithmetic in bigint until final divide to avoid precision loss.
    const totalVolumeSol   = Number((totalVolumeLamports   * 10_000n) / LAMPORTS_PER_SOL) / 10_000
    const feesCollectedSol = Number((feesCollectedLamports * 10_000n) / LAMPORTS_PER_SOL) / 10_000

    // Build 14-day daily buckets from recent duels.
    const dayMap = new Map<string, { count: number; lamports: bigint }>()
    for (let i = 13; i >= 0; i--) {
      const d   = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      dayMap.set(key, { count: 0, lamports: 0n })
    }
    for (const d of recentDuelsForChart) {
      const key    = d.createdAt.toISOString().slice(0, 10)
      const bucket = dayMap.get(key)
      if (bucket) {
        bucket.count++
        bucket.lamports += d.stakeLamports * 2n
      }
    }

    const duelsPerDay  = Array.from(dayMap.entries()).map(([date, { count }]) => ({ date, count }))
    const volumePerDay = Array.from(dayMap.entries()).map(([date, { lamports }]) => ({
      date,
      sol: parseFloat((Number((lamports * 10_000n) / LAMPORTS_PER_SOL) / 10_000).toFixed(4)),
    }))

    // Map win-rate rows to the expected shape (L-001 fix).
    const winRateByGame = winRateRows.map((row) => ({
      gameId:       row.game === "CLASH_ROYALE" ? "clash-royale" : "brawl-stars",
      totalMatches: Number(row.total),
      p1WinRate:    row.total > 0n ? Number(row.wins) / Number(row.total) : 0.5,
    }))

    const snapshot: AnalyticsSnapshot = {
      totalDuels,
      activeDuels,
      totalVolumeSol,
      feesCollectedSol,
      totalTournaments,
      activePlayers30d,
      duelsPerDay,
      volumePerDay,
      winRateByGame,
    }

    return ok({ data: snapshot })
  })
}
