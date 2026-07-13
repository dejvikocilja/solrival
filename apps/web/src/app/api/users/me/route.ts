import { type NextRequest } from "next/server";
import { Prisma, prisma } from "@solrival/db";
import { updateProfileSchema, type SessionUser } from "@solrival/shared";
import { requireUser, toSessionUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET current user's full profile.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok<{ user: SessionUser }>({ user: toSessionUser(user) });
  });
}

// PATCH username. Uniqueness is case-insensitive: the DB's unique index lives on
// `username_lower`, so "Dejvi" cannot be claimed while "dejvi" exists.
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { username } = updateProfileSchema.parse(await req.json());

    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { username, usernameLower: username.toLowerCase() },
      });
      return ok<{ user: SessionUser }>({ user: toSessionUser(updated) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("USERNAME_TAKEN", "That username is already taken", 409);
      }
      throw e;
    }
  });
}
