import { type NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { createTournament, toTournamentView } from "@/server/services/tournament/service"
import { handle, ok } from "@/server/http/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  game: z.enum(["CLASH_ROYALE", "BRAWL_STARS"]),
  maxParticipants: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
  entryFeeLamports: z.coerce.bigint().positive(),
  prizeDistribution: z
    .array(z.object({ place: z.number().int().min(1), bps: z.number().int().min(1).max(10_000) }))
    .min(1),
  startTime: z.coerce.date(),
  registrationClosesAt: z.coerce.date().optional(),
  ruleId: z.string().uuid().optional(),
})

/** POST /api/admin/tournaments — create a tournament (opens registration). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin()
    const input = createSchema.parse(await req.json())
    const tournament = await createTournament(admin, input)
    return ok({ data: toTournamentView(tournament) }, { status: 201 })
  })
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin()

    // H-004: paginated query — avoids loading all rows at once.
    const url   = new URL(req.url)
    const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)))
    const skip  = (page - 1) * limit

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count:         { select: { players: true, matches: true } },
          createdByAdmin: { select: { username: true } },
          winner:         { select: { username: true } },
          rule:           { select: { displayName: true } },
        },
      }),
      prisma.tournament.count(),
    ])

    const data = tournaments.map((t) => ({
      ...t,
      entryFeeLamports:  t.entryFeeLamports.toString(),
      prizePoolLamports: t.prizePoolLamports.toString(),
    }))

    return ok({ data, meta: { total, page, limit } })
  })
}
