import { type NextRequest } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/server/auth/session"
import { isValidUuid } from "@/server/guards/validate-uuid"
import {
  cancelTournament,
  startTournament,
  toTournamentView,
} from "@/server/services/tournament/service"
import { handle, ok, fail } from "@/server/http/respond"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const patchSchema = z.object({
  action: z.enum(["cancel", "start"]),
})

/**
 * PATCH /api/admin/tournaments/:id — start or cancel.
 *  - start  : seeds the bracket (TournamentMatch rows + advancement links) and
 *             moves the tournament to IN_PROGRESS.
 *  - cancel : refunds every locked entry fee and closes the tournament.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin()
    const { id } = await params
    if (!isValidUuid(id)) return fail("BAD_ID", "Invalid tournament id", 400)
    const body = patchSchema.parse(await req.json())

    const updated =
      body.action === "start" ? await startTournament(id) : await cancelTournament(id)

    return ok({ data: toTournamentView(updated) })
  })
}
