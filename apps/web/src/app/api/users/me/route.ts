import { type NextRequest } from "next/server";
import { Prisma, prisma } from "@solrival/db";
import { updateProfileSchema, type SessionUser } from "@solrival/shared";
import { requireUser, toSessionUser } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok, fail } from "@/server/http/respond";
import {
  USERNAME_CHANGE_COOLDOWN_DAYS,
  checkUsernameChangeEligibility,
  usernameCooldownMessage,
} from "@/server/services/user/username";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET current user's full profile, plus whether the username may be changed
// right now — the settings UI needs this to disable the field up front rather
// than letting someone type a new name and only then be told no.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const eligibility = checkUsernameChangeEligibility(user.usernameChangedAt);
    return ok<{
      user: SessionUser;
      usernameChange: {
        canChange: boolean;
        availableAt: string | null;
        daysRemaining: number;
        cooldownDays: number;
      };
    }>({
      user: toSessionUser(user),
      usernameChange: {
        canChange: eligibility.canChange,
        availableAt: eligibility.availableAt?.toISOString() ?? null,
        daysRemaining: eligibility.daysRemaining,
        cooldownDays: USERNAME_CHANGE_COOLDOWN_DAYS,
      },
    });
  });
}

/**
 * PATCH username.
 *
 * Uniqueness is case-insensitive: the DB's unique index lives on
 * `username_lower`, so "Dejvi" cannot be claimed while "dejvi" exists.
 *
 * Changes are rate limited to one per cooldown window. The check is enforced
 * inside the same UPDATE that performs the change (a conditional `updateMany`
 * on `usernameChangedAt`), not as a separate read-then-write — two concurrent
 * requests would otherwise both pass a prior check and both succeed.
 */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { username } = updateProfileSchema.parse(await req.json());

    // Re-picking the identical name is a no-op, not a change — it shouldn't
    // burn the cooldown or fail once the cooldown is active.
    if (username === user.username) {
      return ok<{ user: SessionUser }>({ user: toSessionUser(user) });
    }

    const eligibility = checkUsernameChangeEligibility(user.usernameChangedAt);
    if (!eligibility.canChange) {
      return fail("USERNAME_COOLDOWN", usernameCooldownMessage(eligibility), 429, {
        availableAt: eligibility.availableAt?.toISOString() ?? null,
        daysRemaining: eligibility.daysRemaining,
      });
    }

    try {
      // Conditional write: only proceeds if `usernameChangedAt` is still what
      // the eligibility check was based on. A racing second request finds the
      // value already advanced and updates nothing.
      const changed = await prisma.user.updateMany({
        where: { id: user.id, usernameChangedAt: user.usernameChangedAt },
        data: {
          username,
          usernameLower: username.toLowerCase(),
          usernameChangedAt: new Date(),
        },
      });

      if (changed.count === 0) {
        return fail("USERNAME_COOLDOWN", "Username was just changed — try again later", 429);
      }

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      return ok<{ user: SessionUser }>({ user: toSessionUser(updated) });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return fail("USERNAME_TAKEN", "That username is already taken", 409);
      }
      throw e;
    }
  });
}
