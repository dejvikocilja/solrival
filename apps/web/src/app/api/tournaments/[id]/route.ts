import { type NextRequest } from "next/server";
import { getTournamentDetail } from "@/server/services/tournament/service";
import { isValidUuid } from "@/server/guards/validate-uuid";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tournaments/:id — public tournament detail, players, and bracket. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    if (!isValidUuid(id)) return fail("BAD_ID", "Invalid tournament id", 400);
    return ok(await getTournamentDetail(id));
  });
}
