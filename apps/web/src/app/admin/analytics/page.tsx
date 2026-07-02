import { prisma } from "@solrival/db"
import { requireAdminPage } from "@/server/auth/session"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { StatCard } from "@/components/admin/StatCard"
import { DuelsBarChart } from "@/components/admin/analytics/DuelsBarChart"
import { VolumeAreaChart } from "@/components/admin/analytics/VolumeAreaChart"
import { PlayersAreaChart } from "@/components/admin/analytics/PlayersAreaChart"
import { GameSplitChart } from "@/components/admin/analytics/GameSplitChart"
import { Activity, Coins, Swords, Trophy, TrendingUp, Users } from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Overview" }

const LAMPORTS = 1_000_000_000n

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function getAnalytics() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const [
    totalDuels,
    activeDuels,
    totalTournaments,
    completedDuels,
    recentDuels,
    recentDuelsChart,
    crCompleted,
    bsCompleted,
    recentSignups,
  ] = await Promise.all([
    prisma.duel.count(),
    prisma.duel.count({ where: { status: { in: ["ACTIVE", "VERIFYING"] } } }),
    prisma.tournament.count(),
    prisma.duel.findMany({
      where: { status: "COMPLETED" },
      select: { stakeLamports: true, feeCollectedLamports: true },
    }),
    prisma.duel.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { creatorId: true, opponentId: true },
    }),
    prisma.duel.findMany({
      where: { createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true, stakeLamports: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.duel.count({ where: { game: "CLASH_ROYALE", status: "COMPLETED" } }),
    prisma.duel.count({ where: { game: "BRAWL_STARS", status: "COMPLETED" } }),
    prisma.user.findMany({
      where: { createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
  ])

  const totalVolumeLamports = completedDuels.reduce((s, d) => s + d.stakeLamports * 2n, 0n)
  const feesCollectedLamports = completedDuels.reduce((s, d) => s + (d.feeCollectedLamports ?? 0n), 0n)

  const activePlayerIds = new Set<string>()
  for (const d of recentDuels) {
    activePlayerIds.add(d.creatorId)
    if (d.opponentId) activePlayerIds.add(d.opponentId)
  }

  // 14-day daily buckets
  const dayMap = new Map<string, { count: number; lamports: bigint }>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dayMap.set(d.toISOString().slice(0, 10), { count: 0, lamports: 0n })
  }
  for (const d of recentDuelsChart) {
    const key = d.createdAt.toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket) {
      bucket.count++
      bucket.lamports += d.stakeLamports * 2n
    }
  }

  const duelsPerDay = Array.from(dayMap.entries()).map(([date, { count }]) => ({ date, count }))
  const volumePerDay = Array.from(dayMap.entries()).map(([date, { lamports }]) => ({
    date,
    sol: Number(lamports) / Number(LAMPORTS),
  }))

  // Signups share the same 14-day window; bucket independently of the duel map.
  const signupMap = new Map<string, number>()
  for (const [date] of dayMap) signupMap.set(date, 0)
  for (const u of recentSignups) {
    const key = u.createdAt.toISOString().slice(0, 10)
    if (signupMap.has(key)) signupMap.set(key, (signupMap.get(key) ?? 0) + 1)
  }
  const playersPerDay = Array.from(signupMap.entries()).map(([date, count]) => ({ date, count }))

  return {
    totalDuels,
    activeDuels,
    totalVolumeSol: Number(totalVolumeLamports) / Number(LAMPORTS),
    feesCollectedSol: Number(feesCollectedLamports) / Number(LAMPORTS),
    totalTournaments,
    activePlayers30d: activePlayerIds.size,
    duelsPerDay,
    volumePerDay,
    playersPerDay,
    crCompleted,
    bsCompleted,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminAnalyticsPage() {
  await requireAdminPage()

  let data
  try {
    data = await getAnalytics()
  } catch {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-body-sm text-faint">
          Unable to load analytics — ensure the database is connected.
        </p>
      </div>
    )
  }

  const gameSplit = [
    { game: "Clash Royale", matches: data.crCompleted, color: "hsl(var(--cr))" },
    { game: "Brawl Stars", matches: data.bsCompleted, color: "hsl(var(--bs))" },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-heading-1 text-fg">Overview</h1>
        <p className="mt-1 text-body-sm text-muted">Platform-wide metrics and activity.</p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 sm:gap-4">
        <StatCard
          label="Total duels"
          value={data.totalDuels.toLocaleString()}
          icon={<Swords className="h-4 w-4" />}
        />
        <StatCard
          label="Active now"
          value={data.activeDuels.toLocaleString()}
          accent={data.activeDuels > 0 ? "rival" : "neutral"}
          delta={data.activeDuels > 0 ? "Live" : undefined}
          deltaPositive={data.activeDuels > 0}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Total volume"
          value={`◎${data.totalVolumeSol.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          accent="victory"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Fees collected"
          value={`◎${data.feesCollectedSol.toLocaleString(undefined, { maximumFractionDigits: 4 })}`}
          accent="victory"
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          label="Tournaments"
          value={data.totalTournaments.toLocaleString()}
          icon={<Trophy className="h-4 w-4" />}
        />
        <StatCard
          label="Active players"
          value={data.activePlayers30d.toLocaleString()}
          sublabel="last 30 days"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <div>
              <h2 className="text-heading-3 text-fg">Duels per day</h2>
              <p className="mt-0.5 text-caption text-faint">Last 14 days</p>
            </div>
          </CardHeader>
          <CardContent>
            <DuelsBarChart data={data.duelsPerDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <div>
              <h2 className="text-heading-3 text-fg">Volume per day</h2>
              <p className="mt-0.5 text-caption text-faint">Last 14 days · total stake ×2</p>
            </div>
          </CardHeader>
          <CardContent>
            <VolumeAreaChart data={data.volumePerDay} />
          </CardContent>
        </Card>
      </div>

      {/* Game split + growth */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-heading-3 text-fg">Completed matches by game</h2>
            <p className="mt-0.5 text-caption text-faint">All-time distribution</p>
          </CardHeader>
          <CardContent>
            <GameSplitChart data={gameSplit} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-heading-3 text-fg">New players per day</h2>
            <p className="mt-0.5 text-caption text-faint">Last 14 days</p>
          </CardHeader>
          <CardContent>
            <PlayersAreaChart data={data.playersPerDay} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
