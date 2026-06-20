import { type NextRequest } from "next/server";
import { verifyRequestSchema, type VerifyResponse } from "@solrival/shared";
import { consumeChallenge } from "@/server/auth/challenge";
import { verifySolanaSignature } from "@/server/auth/verify-signature";
import { findOrCreateUser } from "@/server/auth/user";
import { attachSessionCookie, toSessionUser } from "@/server/auth/session";
import { rateLimit, clientIp } from "@/server/guards/rate-limit";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";

/**
 * Completes Sign-In With Solana:
 *  1. atomically consume the single-use challenge (replay-safe)
 *  2. verify the ed25519 signature over the server-issued message
 *  3. find-or-create the user, capture wallet provider
 *  4. issue the session cookie
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);

    const limit = await rateLimit({
      key: `verify:${clientIp(req)}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.ok) return fail("RATE_LIMITED", "Too many requests", 429);

    const body = verifyRequestSchema.parse(await req.json());

    const challenge = await consumeChallenge(body.walletAddress, body.nonce);
    if (!challenge) return fail("INVALID_NONCE", "Challenge expired or already used", 401);

    const valid = verifySolanaSignature({
      message: challenge.message,
      signatureBase58: body.signature,
      walletAddress: body.walletAddress,
    });
    if (!valid) return fail("INVALID_SIGNATURE", "Signature verification failed", 401);

    const user = await findOrCreateUser(body.walletAddress, body.provider);
    if (user.suspended) return fail("ACCOUNT_SUSPENDED", "This account is suspended", 403);

    const payload: VerifyResponse = { user: toSessionUser(user) };
    return attachSessionCookie(ok(payload), user);
  });
}
