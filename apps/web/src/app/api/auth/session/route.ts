import { getCurrentUser, toSessionUser } from "@/server/auth/session";
import { handle, ok } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the current session user, or { user: null } if unauthenticated.
export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    return ok({ user: user ? toSessionUser(user) : null });
  });
}
