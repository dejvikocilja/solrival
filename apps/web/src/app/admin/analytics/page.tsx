import { prisma } from "@solrival/db"
import { requireAdminPage } from "@/server/auth/session"
import { StatCard } from "@/components/admin/StatCard"
import {
  BarChart2, Swords, TrendingUp, DollarSign, Trophy, Users,
} from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Overview" }

const LAMPORTS = 1_000_000_000n

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function getAnalytics() {
  const now             = new Date()
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
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
  ] = await Promise.all([
    prisma.duel.count(),
    prisma.duel.count({ where: { status: { in: ["ACTIVE", "VERIFYING"] } } }),
    prisma.tournament.count(),
    prisma.duel.findMany({
      where:  { status: "COMPLETED" },
      select: { stakeLamports: true, feeCollectedLamports: true },
    }),
    prisma.duel.findMany({
      where:  { createdAt: { gte: thirtyDaysAgo } },
      select: { creatorId: true, opponentId: true },
    }),
    prisma.duel.findMany({
      where:   { createdAt: { gte: fourteenDaysAgo } },
      select:  { createdAt: true, stakeLamports: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.duel.count({ where: { game: "CLASH_ROYALE", status: "COMPLETED" } }),
    prisma.duel.count({ where: { game: "BRAWL_STARS",  status: "COMPLETED" } }),
  ])

  const totalVolumeLamports   = completedDuels.reduce((s, d) => s + d.stakeLamports * 2n, 0n)
  const feesCollectedLamports = completedDuels.reduce((s, d) => s + (d.feeCollectedLamports ?? 0n), 0n)

  const activePlayerIds = new Set<string>()
  for (const d of recentDuels) {
    activePlayerIds.add(d.creatorId)
    if (d.opponentId) activePlayerIds.add(d.opponentId)
  }

  // 14-day buckets
  const dayMap = new Map<string, { count: number; lamports: bigint }>()
  for (let i = 13; i >= 0; i--) {
    const d   = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dayMap.set(d.toISOString().slice(0, 10), { count: 0, lamports: 0n })
  }
  for (const d of recentDuelsChart) {
    const key    = d.createdAt.toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket) { bucket.count++; bucket.lamports += d.stakeLamports * 2n }
  }

  const duelsPerDay  = Array.from(dayMap.entries()).map(([date, { count }]) => ({ date, count }))
  const volumePerDay = Array.from(dayMap.entries()).map(([date, { lamports }]) => ({
    date,
    sol: Number(lamports) / Number(LAMPORTS),
  }))

  return {
    totalDuels,
    activeDuels,
    totalVolumeSol:   Number(totalVolumeLamports)   / Number(LAMPORTS),
    feesCollectedSol: Number(feesCollectedLamports)  / Number(LAMPORTS),
    totalTournaments,
    activePlayers30d: activePlayerIds.size,
    duelsPerDay,
    volumePerDay,
    crCompleted,
    bsCompleted,
  }
}

// ─── SVG Charts ───────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max    = Math.max(...data.map((d) => d.count), 1)
  const W      = 560
  const H      = 120
  const PAD    = { top: 8, right: 4, bottom: 28, left: 28 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom
  const barW   = Math.floor((chartW / data.length) * 0.65)
  const gap    = chartW / data.length

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-label="Duels per day bar chart"
      className="w-full"
      style={{ height: H }}
    >
      {/* Y grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PAD.top + chartH * (1 - f)
        return (
          <g key={f}>
            <line
              x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
              stroke="#27272a" strokeWidth="1"
            />
            <text x={PAD.left - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="#52525b">
              {Math.round(max * f)}
            </text>
          </g>
        )
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH   = (d.count / max) * chartH
        const x      = PAD.left + i * gap + (gap - barW) / 2
        const y      = PAD.top + chartH - barH
        const isLast = i === data.length - 1
        return (
          <g key={d.date}>
            <rect
              x={x} y={y} width={barW} height={Math.max(barH, 1)}
              rx="2"
              fill={isLast ? "#7c3aed" : "#4c1d95"}
              opacity={isLast ? 1 : 0.7}
            />
            {/* Label every 3rd */}
            {i % 3 === 0 && (
              <text
                x={x + barW / 2}
                y={PAD.top + chartH + 16}
                textAnchor="middle"
                fontSize="8"
                fill="#52525b"
              >
                {d.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data }: { data: { date: string; sol: number }[] }) {
  const max    = Math.max(...data.map((d) => d.sol), 0.001)
  const W      = 560
  const H      = 120
  const PAD    = { top: 8, right: 4, bottom: 28, left: 36 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top  - PAD.bottom

  const pts = data.map((d, i) => ({
    x: PAD.left + (i / (data.length - 1)) * chartW,
    y: PAD.top  + chartH * (1 - d.sol / max),
    ...d,
  }))

  const pathD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")

  const areaD =
    pathD +
    ` L${pts[pts.length - 1]!.x.toFixed(1)},${(PAD.top + chartH).toFixed(1)}` +
    ` L${PAD.left.toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-label="Volume per day line chart"
      className="w-full"
      style={{ height: H }}
    >
      <defs>
        <linearGradient id="vol-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y grid */}
      {[0, 0.5, 1].map((f) => {
        const y = PAD.top + chartH * (1 - f)
        return (
          <g key={f}>
            <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="#27272a" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="#52525b">
              {(max * f).toFixed(2)}
            </text>
          </g>
        )
      })}

      {/* Area fill */}
      <path d={areaD} fill="url(#vol-grad)" />

      {/* Line */}
      <path d={pathD} fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinejoin="round" />

      {/* Dots + labels */}
      {pts.map((p, i) => (
        <g key={p.date}>
          <circle cx={p.x} cy={p.y} r="2" fill="#7c3aed" />
          {i % 3 === 0 && (
            <text
              x={p.x}
              y={PAD.top + chartH + 16}
              textAnchor="middle"
              fontSize="8"
              fill="#52525b"
            >
              {p.date.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
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
        <p className="text-sm text-zinc-500">
          Unable to load analytics — ensure the database is connected.
        </p>
      </div>
    )
  }

  const totalMatches = data.crCompleted + data.bsCompleted

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-semibold text-zinc-100">Overview</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Platform-wide metrics and activity.</p>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total duels"
          value={data.totalDuels.toLocaleString()}
          icon={<Swords className="h-4 w-4" />}
        />
        <StatCard
          label="Active now"
          value={data.activeDuels.toLocaleString()}
          deltaPositive={data.activeDuels > 0}
          delta={data.activeDuels > 0 ? "Live" : undefined}
          icon={<BarChart2 className="h-4 w-4" />}
        />
        <StatCard
          label="Total volume"
          value={`${data.totalVolumeSol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Fees collected"
          value={`${data.feesCollectedSol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`}
          icon={<DollarSign className="h-4 w-4" />}
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Duels per day */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Duels per day</h2>
            <p className="text-xs text-zinc-500">Last 14 days</p>
          </div>
          <BarChart data={data.duelsPerDay} />
        </div>

        {/* Volume per day */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Volume (SOL) per day</h2>
            <p className="text-xs text-zinc-500">Last 14 days · total stake × 2</p>
          </div>
          <LineChart data={data.volumePerDay} />
        </div>
      </div>

      {/* Win rate by game */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">Completed matches by game</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <GameCard
            game="Clash Royale"
            matches={data.crCompleted}
            total={totalMatches}
            color="#3b82f6"
          />
          <GameCard
            game="Brawl Stars"
            matches={data.bsCompleted}
            total={totalMatches}
            color="#a855f7"
          />
        </div>
      </div>
    </div>
  )
}

function GameCard({
  game,
  matches,
  total,
  color,
}: {
  game:    string
  matches: number
  total:   number
  color:   string
}) {
  const pct = total > 0 ? Math.round((matches / total) * 100) : 0
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-300">{game}</p>
        <span className="text-sm font-semibold tabular-nums text-zinc-100">
          {matches.toLocaleString()} matches
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1.5 text-xs text-zinc-600">{pct}% of all completed matches</p>
    </div>
  )
}
