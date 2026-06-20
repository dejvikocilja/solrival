import { type NextRequest } from "next/server";
import { nonceRequestSchema, type NonceResponse } from "@solrival/shared";
import { createChallenge } from "@/server/auth/challenge";
import { rateLimit, clientIp } from "@/server/guards/rate-limit";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";

// Issues a single-use challenge for the wallet to sign.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);

    const limit = await rateLimit({
      key: `nonce:${clientIp(req)}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.ok) return fail("RATE_LIMITED", "Too many requests", 429);

    const body = nonceRequestSchema.parse(await req.json());
    const { nonce, message, expiresAt } = await createChallenge(body.walletAddress);

    const res: NonceResponse = { nonce, message, expiresAt: expiresAt.toISOString() };
    return ok(res);
  });
}
