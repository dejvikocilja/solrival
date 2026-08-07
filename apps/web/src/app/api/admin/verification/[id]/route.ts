import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@solrival/db";
import { requireAdmin } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/guards/origin";
import { handle, ok, fail } from "@/server/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.literal("rerun") });

/** Extra attempts granted per manual re-run. */
const RERUN_ATTEMPT_GRANT = 10;

/**
 * POST /api/admin/verification/:id — manual verification controls.
 *
 * Re-queues a verification job so the next sweep picks it up again. The admin
 * UI has had this button since launch, but it posted to a route that did not
 * exist and ignored the 404, so it silently did nothing.
 *
 * A re-run is only useful when the reason for the original failure has since
 * changed — a rule corrected, a game account relinked, a provider outage over.
 * It re-reads the battle log; it does not decide a winner. Forcing an outcome
 * remains the separate, audited force-settle action.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const { id } = await params;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("BAD_REQUEST", "Unsupported action", 400);

    const job = await prisma.verificationJob.findUnique({
      where: { id },
      include: { duel: { select: { id: true, status: true, shortCode: true } } },
    });
    if (!job) return fail("NOT_FOUND", "Verification job not found", 404);

    // Hard guard: a duel that has already paid out, refunded, or been cancelled
    // must never be re-verified. Re-running one would let the engine detect a
    // winner for a duel whose funds are gone, and the settlement path is only
    // idempotent against ITS own key — not against a second, contradictory
    // verdict. The stakes are settled; the job is history.
    if (job.duel.status !== "ACTIVE" && job.duel.status !== "VERIFYING") {
      return fail(
        "DUEL_NOT_OPEN",
        `Duel is ${job.duel.status.toLowerCase()} — verification can't be re-run once it is settled`,
        409,
      );
    }

    // Nothing to do if the sweep already has it in hand; re-queueing a RUNNING
    // job would have two workers racing on one duel.
    if (job.status === "RUNNING") {
      return fail("JOB_RUNNING", "Verification is already in progress — try again shortly", 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.verificationJob.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          outcome: null,
          lastError: null,
          completedAt: null,
          startedAt: null,
          scheduledAt: new Date(),
          // Attempts are preserved as a record of how much has been tried; the
          // ceiling is lifted instead, so an exhausted job can run again
          // without erasing its history.
          maxAttempts: job.attempts + RERUN_ATTEMPT_GRANT,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: "VERIFICATION_OVERRIDDEN",
          entityType: "VerificationJob",
          entityId: job.id,
          metadata: {
            reason: "manual re-run",
            duelId: job.duel.id,
            previousStatus: job.status,
            attempts: job.attempts,
            newMaxAttempts: row.maxAttempts,
          },
        },
      });

      return row;
    });

    // The duel must be back in a state the sweep will pick up. A duel left
    // VERIFYING is already selected; ACTIVE is equally fine.
    return ok({
      job: {
        id: updated.id,
        status: updated.status,
        attempts: updated.attempts,
        maxAttempts: updated.maxAttempts,
      },
    });
  });
}
