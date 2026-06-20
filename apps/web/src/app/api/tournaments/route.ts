import { type NextRequest } from "next/server";
import { z } from "zod";
import { listTournaments } from "@/server/services/tournament/service";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "REGISTRATION_OPEN",
      "REGISTRATION_CLOSED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** GET /api/tournaments — public, paginated tournament list. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    return ok(await listTournaments(q));
  });
}
