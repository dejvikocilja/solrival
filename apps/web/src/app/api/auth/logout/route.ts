import { type NextRequest } from "next/server";
import { clearSessionCookie } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";

// Clears the session cookie. Idempotent.
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    return clearSessionCookie(ok({ success: true }));
  });
}
