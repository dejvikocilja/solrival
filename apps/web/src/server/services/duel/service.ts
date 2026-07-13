import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { prisma, type Duel, type User } from "@solrival/db";
import { computeSettlement, EscrowStatus } from "@solrival/sdk";
import {
  type CreateDuelInput,
  type Game,
} from "@solrival/shared";
import {
  createDuelRecord,
  claimOpponent,
  findExpiredDuels,
  markEscrowTxConfirmed,
  transitionStatus,
  upsertEscrowTx,
  DuelConflictError,
} from "./repo";
import { buildUnsignedTx, confirmTxSucceeded, escrowIsClosed, fetchEscrow } from "./onchain";
import { escrowClient, platformFeeBps } from "../../solana/config";
import { requireLinkedGameAccount } from "@/server/services/game-account/service";
import { expireCreditDuel } from "./credit-duel";


const DUEL_WINDOW_MS = 30 * 60 * 1000;

export class DuelError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DuelError";
  }
}

const forbidden = () => new DuelError("FORBIDDEN", "Not your duel", 403);
const badStatus = (msg = "Duel is not in a valid state for this action") =>
  new DuelError("INVALID_STATUS", msg, 409);

function shortCode(): string {
  return randomBytes(5).toString("hex"); // 10 chars
}
function inviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Public-safe duel shape; BigInt fields serialized to strings. */
export function toDuelSummary(d: Duel) {
  return {
    id: d.id,
    shortCode: d.shortCode,
    game: d.game,
    visibility: d.visibility,
    status: d.status,
    creatorId: d.creatorId,
    opponentId: d.opponentId,
    stakeLamports: d.stakeLamports.toString(),
    platformFeeBps: d.platformFeeBps,
    escrowPda: d.escrowPda,
    inviteToken: d.inviteToken,
    expiresAt: d.expiresAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
  };
}

function economics(stakeLamports: bigint, feeBps: number) {
  const { pot, fee, payout } = computeSettlement(stakeLamports, feeBps);
  return {
    stakeLamports: stakeLamports.toString(),
    platformFeeBps: feeBps,
    potLamports: pot.toString(),
    feeLamports: fee.toString(),
    rewardLamports: payout.toString(), // winner receives pot - fee
  };
}

// ---------------------------------------------------------------- create -----
export async function createDuel(user: User, input: CreateDuelInput) {
  const rule = await prisma.duelRule.findFirst({
    where: { template: input.ruleTemplate, enabled: true },
  });
  if (!rule) throw new DuelError("RULE_UNAVAILABLE", "Rule template is not available", 400);

  const id = randomUUID();
  const creator = new PublicKey(user.walletAddress);
  const escrowPda = escrowClient.escrowPda(id).toBase58();

  // Link the creator's game account for this game so the arena can show
  // and filter by their trophies / level / win rate.
  const creatorGameAccount = await requireLinkedGameAccount(user.id, input.game);

  const duel = await createDuelRecord({
    id,
    shortCode: shortCode(),
    inviteToken: input.visibility === "PRIVATE" ? inviteToken() : null,
    game: input.game,
    visibility: input.visibility,
    creatorId: user.id,
    creatorGameAccountId: creatorGameAccount.id,
    creatorFriendLink: creatorGameAccount.friendLink,
    ruleId: rule.id,
    stakeLamports: input.stakeLamports,
    platformFeeBps,
    escrowSeed: id,
    escrowPda,
    expiresAt: new Date(Date.now() + DUEL_WINDOW_MS),
  });

  await upsertEscrowTx({
    duelId: id,
    type: "DEPOSIT_CREATOR",
    amountLamports: input.stakeLamports,
    idempotencyKey: `${id}:deposit_creator`,
    fromWallet: user.walletAddress,
    toWallet: escrowPda,
  });

  const ix = escrowClient.initializeDuel({ creator, duelId: id, stakeLamports: input.stakeLamports });
  const transaction = await buildUnsignedTx(creator, [ix]);

  return { duel: toDuelSummary(duel), transaction, economics: economics(input.stakeLamports, platformFeeBps) };
}

// ------------------------------------------------------ confirm deposit ------
export async function confirmDeposit(user: User, duel: Duel, signature: string) {
  if (duel.creatorId !== user.id) throw forbidden();
  if (duel.status === "WAITING_FOR_OPPONENT") return toDuelSummary(duel); // idempotent
  if (duel.status !== "CREATED") throw badStatus();

  const escrow = await fetchEscrow(new PublicKey(duel.escrowPda!));
  const ok =
    (await confirmTxSucceeded(signature)) &&
    escrow !== null &&
    escrow.creator.toBase58() === user.walletAddress &&
    escrow.status === EscrowStatus.WaitingForOpponent &&
    escrow.stakeLamports === duel.stakeLamports;
  if (!ok) throw new DuelError("DEPOSIT_UNVERIFIED", "Could not verify the on-chain deposit", 400);

  await markEscrowTxConfirmed(`${duel.id}:deposit_creator`, signature);
  const updated = await transitionStatus(duel.id, "CREATED", "WAITING_FOR_OPPONENT", {
    escrowFundedAt: new Date(),
  });
  return toDuelSummary(updated);
}

// -------------------------------------------------------- request accept -----
export async function requestAccept(user: User, duel: Duel) {
  if (duel.creatorId === user.id) throw new DuelError("SELF_ACCEPT", "You cannot accept your own duel", 400);
  if (duel.status !== "WAITING_FOR_OPPONENT") throw badStatus("Duel is not open for acceptance");
  if (duel.expiresAt.getTime() <= Date.now()) throw new DuelError("EXPIRED", "Duel has expired", 410);
  await requireLinkedGameAccount(user.id, duel.game); // fail fast, before any signing

  const opponent = new PublicKey(user.walletAddress);
  const ix = escrowClient.acceptDuel({ opponent, duelId: duel.id });
  const transaction = await buildUnsignedTx(opponent, [ix]);
  return { transaction, economics: economics(duel.stakeLamports, duel.platformFeeBps) };
}

// -------------------------------------------------------- confirm accept -----
export async function confirmAccept(user: User, duel: Duel, signature: string) {
  if (duel.creatorId === user.id) throw new DuelError("SELF_ACCEPT", "You cannot accept your own duel", 400);
  if (duel.opponentId === user.id && duel.status !== "WAITING_FOR_OPPONENT") return toDuelSummary(duel); // idempotent
  if (duel.status !== "WAITING_FOR_OPPONENT") throw badStatus("Duel is not open for acceptance");
  const opponentGameAccount = await requireLinkedGameAccount(user.id, duel.game);

  const escrow = await fetchEscrow(new PublicKey(duel.escrowPda!));
  const ok =
    (await confirmTxSucceeded(signature)) &&
    escrow !== null &&
    escrow.status === EscrowStatus.Funded &&
    escrow.opponent?.toBase58() === user.walletAddress;
  if (!ok) throw new DuelError("ACCEPT_UNVERIFIED", "Could not verify the on-chain acceptance", 400);

  await upsertEscrowTx({
    duelId: duel.id,
    type: "DEPOSIT_OPPONENT",
    amountLamports: duel.stakeLamports,
    idempotencyKey: `${duel.id}:deposit_opponent`,
    fromWallet: user.walletAddress,
    toWallet: duel.escrowPda!,
  });
  await markEscrowTxConfirmed(`${duel.id}:deposit_opponent`, signature);

  const updated = await claimOpponent(duel.id, user.id, opponentGameAccount.friendLink, opponentGameAccount.id);
  return toDuelSummary(updated);
}

// ---------------------------------------------------------------- cancel -----
export async function cancelDuel(user: User, duel: Duel) {
  if (duel.creatorId !== user.id) throw forbidden();

  if (duel.status === "CREATED") {
    // Never funded on-chain; pure off-chain cancel.
    const updated = await transitionStatus(duel.id, "CREATED", "CANCELLED");
    return { cancelled: true, duel: toDuelSummary(updated) };
  }

  if (duel.status === "WAITING_FOR_OPPONENT") {
    const creator = new PublicKey(user.walletAddress);
    const ix = escrowClient.cancelDuel({ duelId: duel.id, creator });
    const transaction = await buildUnsignedTx(creator, [ix]);
    return { cancelled: false, transaction }; // finalize via confirm(phase=cancel)
  }

  throw badStatus("Only an unaccepted duel can be cancelled");
}

export async function confirmCancel(user: User, duel: Duel, signature: string) {
  if (duel.creatorId !== user.id) throw forbidden();
  if (duel.status === "CANCELLED") return toDuelSummary(duel); // idempotent
  if (duel.status !== "WAITING_FOR_OPPONENT") throw badStatus();

  const ok = (await confirmTxSucceeded(signature)) && (await escrowIsClosed(new PublicKey(duel.escrowPda!)));
  if (!ok) throw new DuelError("CANCEL_UNVERIFIED", "Could not verify the on-chain refund", 400);

  await upsertEscrowTx({
    duelId: duel.id,
    type: "REFUND_CREATOR",
    amountLamports: duel.stakeLamports,
    idempotencyKey: `${duel.id}:refund_creator_cancel`,
    fromWallet: duel.escrowPda!,
    toWallet: user.walletAddress,
  });
  await markEscrowTxConfirmed(`${duel.id}:refund_creator_cancel`, signature);

  const updated = await transitionStatus(duel.id, "WAITING_FOR_OPPONENT", "CANCELLED");
  return toDuelSummary(updated);
}

// ------------------------------------------------ confirm dispatcher ---------
export async function confirmDuel(
  user: User,
  duel: Duel,
  phase: "deposit" | "accept" | "cancel",
  signature: string,
) {
  switch (phase) {
    case "deposit":
      return confirmDeposit(user, duel, signature);
    case "accept":
      return confirmAccept(user, duel, signature);
    case "cancel":
      return confirmCancel(user, duel, signature);
  }
}

// ------------------------------------------------ lifecycle: start match -----
/** Called by the match-initiation step once both players are ready. */
export async function startMatch(duelId: string) {
  return transitionStatus(duelId, "ACCEPTED", "ACTIVE", { activatedAt: new Date() });
}

// ------------------------------------------------------------- expiry --------

/** True when a duel sits past its acceptance window with no opponent. */
function isLapsedOpenDuel(d: Duel): boolean {
  return (
    (d.status === "WAITING_FOR_OPPONENT" || d.status === "CREATED") &&
    d.opponentId === null &&
    d.expiresAt.getTime() <= Date.now()
  );
}

/** Expires a single lapsed duel — refunding the creator's ledger stake for
 *  credit duels, or flipping status for on-chain ones (SOL reclaimed by the
 *  permissionless keeper). Race-guarded and idempotent via expireCreditDuel /
 *  transitionStatus; throws DuelConflictError on a lost race. */
async function expireOneDuel(d: Duel): Promise<{ refunded: boolean }> {
  if (d.fundingMode === "CREDITS") {
    // Credit duels hold the stake only in the ledger — release it here.
    await expireCreditDuel(d);
    return { refunded: true };
  }
  // On-chain duels: flip status; the locked SOL is reclaimed on-chain
  // by the permissionless reclaim_expired keeper.
  await transitionStatus(d.id, d.status, "EXPIRED");
  return { refunded: false };
}

/**
 * Opportunistic expiry: called from read paths (duel detail, my-duels) so a
 * lapsed challenge refunds the moment anyone looks at it, instead of waiting
 * for the next cron tick. The cron sweep remains the backstop for duels nobody
 * revisits. Returns true if this call performed the expiry.
 */
export async function expireIfLapsed(d: Duel): Promise<boolean> {
  if (!isLapsedOpenDuel(d)) return false;
  try {
    await expireOneDuel(d);
    return true;
  } catch (e) {
    if (e instanceof DuelConflictError) return false; // sweep or a peer got there first
    throw e;
  }
}

/**
 * Sweeps pre-acceptance duels past their 30-minute window. CREATED -> EXPIRED
 * (no funds moved). WAITING_FOR_OPPONENT -> EXPIRED; the creator's stake remains
 * reclaimable on-chain via the permissionless reclaim_expired instruction (a
 * keeper refunds it). Per-row errors are swallowed so one conflict can't stall
 * the sweep.
 */
export async function expireDuels(): Promise<{ expired: number; refunded: number }> {
  const rows = await findExpiredDuels();
  let expired = 0;
  let refunded = 0;
  for (const d of rows) {
    try {
      const r = await expireOneDuel(d);
      if (r.refunded) refunded += 1;
      expired += 1;
    } catch (e) {
      if (!(e instanceof DuelConflictError)) throw e; // ignore lost races
    }
  }
  return { expired, refunded };
}
