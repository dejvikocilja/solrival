import { type NextRequest } from "next/server"
import { prisma, type VerificationJobStatus } from "@solrival/db"
import { requireAdmin } from "@/server/auth/session"
import { handle, ok } from "@/server/http/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUS_MAP: Record<string, VerificationJobStatus[]> = {
  verifying: ["QUEUED", "RUNNING", "RETRYING"],
  verified:  ["SUCCEEDED"],
  timeout:   ["DEAD_LETTER"],
  error:     ["FAILED"],
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin()

    const url          = new URL(req.url)
    const statusFilter = url.searchParams.get("status") ?? "all"
    const page         = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10))
    const limit        = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10)))
    const skip         = (page - 1) * limit

    const statusIn = statusFilter !== "all" ? STATUS_MAP[statusFilter] : undefined
    const where    = statusIn ? { status: { in: statusIn } } : {}

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [jobs, total, activeCount, pendingCount, failedCount] = await Promise.all([
      prisma.verificationJob.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { updatedAt: "desc" },
        include: {
          duel: {
            select: {
              id:       true,
              shortCode: true,
              game:     true,
              creator:  { select: { username: true } },
              opponent: { select: { username: true } },
            },
          },
        },
      }),
      prisma.verificationJob.count({ where }),
      prisma.verificationJob.count({ where: { status: { in: ["RUNNING", "RETRYING"] } } }),
      prisma.verificationJob.count({ where: { status: "QUEUED" } }),
      prisma.verificationJob.count({
        where: {
          status:    { in: ["FAILED", "DEAD_LETTER"] },
          updatedAt: { gte: yesterday },
        },
      }),
    ])

    // Average resolution time for succeeded jobs today
    // TODO: replace with raw SQL AVG(completed_at - started_at)
    const succeededRecent = await prisma.verificationJob.findMany({
      where:  { status: "SUCCEEDED", completedAt: { gte: yesterday } },
      select: { startedAt: true, completedAt: true },
    })
    const avgResolutionMs =
      succeededRecent.length > 0
        ? succeededRecent.reduce((sum, j) => {
            if (!j.startedAt || !j.completedAt) return sum
            return sum + (j.completedAt.getTime() - j.startedAt.getTime())
          }, 0) / succeededRecent.length
        : null

    return ok({
      data:  jobs,
      meta:  { total, page, limit },
      stats: { activeCount, pendingCount, failedCount, avgResolutionMs },
    })
  })
}
