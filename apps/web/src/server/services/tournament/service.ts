import "server-only";
import {
  prisma,
  Prisma,
  type Game,
  type Tournament,
  type TournamentMatch,
  type TournamentPlayer,
  type User,
} from "@solrival/db";
import { applyEntry, lockBalances, CreditError } from "../credits/balance";
import {
  publishTournamentStarted,
  publishTournamentMatchCompleted,
  publishTournamentCompleted,
} from "@/lib/realtime/event-publisher";

/**
 * Tournament engine — single-elimination brackets settled on the credits ledger.
 *
 * Economics mirror the duel model: entry fees are LOCKED from the player's
 * balance at registration (available → locked) and accrue to the prize pool.
 * On completion the locked fees are forfeited and the pool is paid out to the
 * placing players' available balance per the tournament's `prizeDistribution`.
 * Cancelling before completion refunds every locked entry fee. No on-chain
 * escrow is involved — this is the same custodial ledger duels use.
 */

export class TournamentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TournamentError";
  }
}

type PrizeTier = { place: number; bps: number };

// ─── Serializers ──────────────────────────────────────────────────────────────

export function toTournamentView(t: Tournament & { _count?: { players: number } }) {
  return {
    id: t.id,
    name: t.name,
    game: t.game,
    format: t.format,
    status: t.status,
    entryFeeLamports: t.entryFeeLamports.toString(),
    maxParticipants: t.maxParticipants,
    prizeDistribution: t.prizeDistribution,
    prizePoolLamports: t.prizePoolLamports.toString(),
    startTime: t.startTime.toISOString(),
    registrationClosesAt: t.registrationClosesAt?.toISOString() ?? null,
    winnerId: t.winnerId,
    playerCount: t._count?.players,
    createdAt: t.createdAt.toISOString(),
  };
}

function toMatchView(m: TournamentMatch) {
  return {
    id: m.id,
    round: m.round,
    bracketPosition: m.bracketPosition,
    status: m.status,
    playerOneId: m.playerOneId,
    playerTwoId: m.playerTwoId,
    winnerId: m.winnerId,
    nextMatchId: m.nextMatchId,
    duelId: m.duelId,
    completedAt: m.completedAt?.toISOString() ?? null,
  };
}

function toPlayerView(p: TournamentPlayer & { user?: { username: string | null } }) {
  return {
    id: p.id,
    userId: p.userId,
    username: p.user?.username ?? null,
    status: p.status,
    seed: p.seed,
    finalPlacement: p.finalPlacement,
  };
}

// ─── Bracket math ─────────────────────────────────────────────────────────────

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(2, size);
}

/**
 * Standard single-elimination seed slot order for a bracket of `size` (a power
 * of two). Returns 1-based seed numbers in bracket-position order, so the byes
 * (highest seeds) are spread out — no match ever has two byes when the field is
 * more than half full.
 */
function seedSlots(size: number): number[] {
  let slots = [1];
  while (slots.length < size) {
    const round = slots.length * 2 + 1;
    const next: number[] = [];
    for (const s of slots) {
      next.push(s);
      next.push(round - s);
    }
    slots = next;
  }
  return slots;
}

// ─── Create (admin) ───────────────────────────────────────────────────────────

export async function createTournament(
  admin: User,
  input: {
    name: string;
    game: Game;
    maxParticipants: number;
    entryFeeLamports: bigint;
    prizeDistribution: PrizeTier[];
    startTime: Date;
    registrationClosesAt?: Date | null;
    ruleId?: string | null;
  },
): Promise<Tournament> {
  const size = input.maxParticipants;
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new TournamentError("BAD_SIZE", "maxParticipants must be a power of two (2, 4, 8, …)", 400);
  }
  const totalBps = input.prizeDistribution.reduce((s, t) => s + t.bps, 0);
  if (totalBps > 10_000) {
    throw new TournamentError("BAD_PRIZES", "Prize distribution exceeds 100% of the pool", 400);
  }

  return prisma.tournament.create({
    data: {
      name: input.name,
      game: input.game,
      maxParticipants: size,
      entryFeeLamports: input.entryFeeLamports,
      prizeDistribution: input.prizeDistribution as unknown as Prisma.InputJsonValue,
      prizePoolLamports: 0n,
      startTime: input.startTime,
      registrationClosesAt: input.registrationClosesAt ?? null,
      ruleId: input.ruleId ?? null,
      createdByAdminId: admin.id,
      status: "REGISTRATION_OPEN",
    },
  });
}

// ─── Register (user) ──────────────────────────────────────────────────────────

export async function registerForTournament(
  user: User,
  tournamentId: string,
  friendLink?: string,
): Promise<TournamentPlayer> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, maxParticipants: true, game: true, entryFeeLamports: true },
  });
  if (!t) throw new TournamentError("NOT_FOUND", "Tournament not found", 404);
  if (t.status !== "REGISTRATION_OPEN") {
    throw new TournamentError("CLOSED", "Registration is not open for this tournament", 409);
  }

  const gameAccount = await prisma.gameAccount.findUnique({
    where: { userId_game: { userId: user.id, game: t.game } },
    select: { id: true },
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.tournamentPlayer.count({ where: { tournamentId } });
      if (count >= t.maxParticipants) {
        throw new TournamentError("FULL", "Tournament is full", 409);
      }

      const player = await tx.tournamentPlayer.create({
        data: {
          tournamentId,
          userId: user.id,
          gameAccountId: gameAccount?.id ?? null,
          friendLink: friendLink ?? null,
          status: "REGISTERED",
        },
      });

      // Lock the entry fee (available → locked) and grow the prize pool.
      await applyEntry(tx, {
        userId: user.id,
        type: "TOURNAMENT_ENTRY_LOCK",
        idempotencyKey: `tourn-lock:${tournamentId}:${user.id}`,
        deltaAvailable: -t.entryFeeLamports,
        deltaLocked: t.entryFeeLamports,
        tournamentId,
        memo: "Tournament entry fee",
      });

      await tx.tournament.update({
        where: { id: tournamentId },
        data: { prizePoolLamports: { increment: t.entryFeeLamports } },
      });

      return player;
    });
  } catch (e) {
    if (e instanceof CreditError && e.code === "INSUFFICIENT_FUNDS") {
      throw new TournamentError("INSUFFICIENT_FUNDS", "Not enough balance for the entry fee", 402);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new TournamentError("ALREADY_REGISTERED", "You are already registered", 409);
    }
    throw e;
  }
}

// ─── Start (admin): generate the seeded bracket ───────────────────────────────

export async function startTournament(tournamentId: string): Promise<Tournament> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, name: true },
  });
  if (!t) throw new TournamentError("NOT_FOUND", "Tournament not found", 404);
  if (t.status !== "REGISTRATION_OPEN" && t.status !== "REGISTRATION_CLOSED") {
    throw new TournamentError("BAD_STATE", "Tournament must be in registration to start", 409);
  }

  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, status: { in: ["REGISTERED", "ACTIVE"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (players.length < 2) {
    throw new TournamentError("TOO_FEW", "At least 2 players are required to start", 409);
  }

  const size = nextPowerOfTwo(players.length);
  const totalRounds = Math.log2(size);
  const order = seedSlots(size); // 1-based seed → bracket slot order

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Create every match row (all rounds), unlinked.
    const rows: Prisma.TournamentMatchCreateManyInput[] = [];
    for (let round = 1; round <= totalRounds; round += 1) {
      const matchesInRound = size / 2 ** round;
      for (let pos = 0; pos < matchesInRound; pos += 1) {
        rows.push({ tournamentId, round, bracketPosition: pos, status: "PENDING" });
      }
    }
    await tx.tournamentMatch.createMany({ data: rows });

    const created = await tx.tournamentMatch.findMany({
      where: { tournamentId },
      select: { id: true, round: true, bracketPosition: true },
    });
    const idAt = new Map<string, string>();
    for (const m of created) idAt.set(`${m.round}:${m.bracketPosition}`, m.id);

    // 2. Link winner-advancement: (round,pos) → (round+1, floor(pos/2)).
    for (let round = 1; round < totalRounds; round += 1) {
      const matchesInRound = size / 2 ** round;
      for (let pos = 0; pos < matchesInRound; pos += 1) {
        const id = idAt.get(`${round}:${pos}`)!;
        const nextId = idAt.get(`${round + 1}:${Math.floor(pos / 2)}`)!;
        await tx.tournamentMatch.update({ where: { id }, data: { nextMatchId: nextId } });
      }
    }

    // 3. Seed round 1 from the standard slot order, assign seeds, mark byes.
    const round1 = size / 2;
    for (let pos = 0; pos < round1; pos += 1) {
      const s1 = order[pos * 2];
      const s2 = order[pos * 2 + 1];
      const p1 = s1 <= players.length ? players[s1 - 1].id : null;
      const p2 = s2 <= players.length ? players[s2 - 1].id : null;
      const id = idAt.get(`1:${pos}`)!;
      const both = p1 !== null && p2 !== null;
      await tx.tournamentMatch.update({
        where: { id },
        data: { playerOneId: p1, playerTwoId: p2, status: both ? "READY" : "BYE" },
      });
    }
    // Assign seed numbers to players (seed = registration order).
    for (let i = 0; i < players.length; i += 1) {
      await tx.tournamentPlayer.update({
        where: { id: players[i].id },
        data: { seed: i + 1, status: "ACTIVE" },
      });
    }

    // 4. Resolve byes: a BYE match advances its lone player. Repeat so a match
    //    fed by two byes also resolves.
    let progressed = true;
    while (progressed) {
      progressed = false;
      const byes = await tx.tournamentMatch.findMany({
        where: { tournamentId, status: "BYE" },
        select: {
          id: true,
          bracketPosition: true,
          playerOneId: true,
          playerTwoId: true,
          nextMatchId: true,
        },
      });
      for (const m of byes) {
        const winner = m.playerOneId ?? m.playerTwoId;
        await tx.tournamentMatch.update({
          where: { id: m.id },
          data: { status: "COMPLETED", winnerId: winner, completedAt: new Date() },
        });
        if (winner && m.nextMatchId) {
          await advanceInto(tx, m.nextMatchId, m.bracketPosition, winner);
        }
        progressed = true;
      }
    }

    return tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "IN_PROGRESS" },
    });
  });

  publishTournamentStarted({ tournamentId, name: t.name, playerCount: players.length });
  return updated;
}

/**
 * Places `winnerId` into the correct slot of its next match (even feeder
 * position → playerOne, odd → playerTwo). Promotes the next match to READY once
 * both slots are filled, or BYE if it only ever gets one (its sibling was an
 * empty feeder — should not happen with proper seeding, but handled for safety).
 */
async function advanceInto(
  tx: Prisma.TransactionClient,
  nextMatchId: string,
  fromPosition: number,
  winnerId: string,
): Promise<void> {
  const slot = fromPosition % 2 === 0 ? "playerOneId" : "playerTwoId";
  const next = await tx.tournamentMatch.findUnique({
    where: { id: nextMatchId },
    select: { playerOneId: true, playerTwoId: true },
  });
  if (!next) return;
  const otherFilled = slot === "playerOneId" ? next.playerTwoId !== null : next.playerOneId !== null;
  await tx.tournamentMatch.update({
    where: { id: nextMatchId },
    data: { [slot]: winnerId, ...(otherFilled ? { status: "READY" } : {}) },
  });
}

// ─── Report a match result (admin) ────────────────────────────────────────────

export async function reportMatch(
  tournamentId: string,
  matchId: string,
  winnerId: string,
): Promise<TournamentMatch> {
  const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId } });
  if (!match) throw new TournamentError("NOT_FOUND", "Match not found", 404);
  if (match.status === "COMPLETED" || match.status === "BYE") {
    throw new TournamentError("ALREADY_DONE", "Match is already decided", 409);
  }
  if (match.playerOneId !== winnerId && match.playerTwoId !== winnerId) {
    throw new TournamentError("BAD_WINNER", "Winner is not a participant in this match", 400);
  }

  const loserId = match.playerOneId === winnerId ? match.playerTwoId : match.playerOneId;

  const completed = await prisma.$transaction(async (tx) => {
    const done = await tx.tournamentMatch.update({
      where: { id: matchId },
      data: { status: "COMPLETED", winnerId, completedAt: new Date() },
    });

    if (loserId) {
      await tx.tournamentPlayer.update({
        where: { id: loserId },
        data: { status: "ELIMINATED", eliminatedAt: new Date() },
      });
    }

    if (match.nextMatchId) {
      await advanceInto(tx, match.nextMatchId, match.bracketPosition, winnerId);
    }

    // If every match is decided, the tournament is over.
    const remaining = await tx.tournamentMatch.count({
      where: { tournamentId, status: { notIn: ["COMPLETED", "BYE"] } },
    });
    if (remaining === 0) {
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { status: "COMPLETED", winnerId: await userIdOfPlayer(tx, winnerId) },
      });
      await distributePrizes(tx, tournamentId);
    }

    return done;
  });

  // Broadcast after commit so subscribers only see settled state.
  const winnerPlayer = await prisma.tournamentPlayer.findUnique({
    where: { id: winnerId },
    select: { user: { select: { username: true } } },
  });
  const winnerTag = winnerPlayer?.user.username ?? winnerId;
  publishTournamentMatchCompleted({
    tournamentId,
    matchId,
    winnerTag,
    roundNumber: match.round,
  });

  const finalState = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true, name: true, prizePoolLamports: true },
  });
  if (finalState?.status === "COMPLETED") {
    publishTournamentCompleted({
      tournamentId,
      name: finalState.name,
      winnerTag,
      prizePoolSol: Number(finalState.prizePoolLamports) / 1_000_000_000,
    });
  }

  return completed;
}

async function userIdOfPlayer(tx: Prisma.TransactionClient, playerId: string): Promise<string> {
  const p = await tx.tournamentPlayer.findUniqueOrThrow({
    where: { id: playerId },
    select: { userId: true },
  });
  return p.userId;
}

// ─── Prize distribution (internal, on completion) ─────────────────────────────

/**
 * Forfeits every active player's locked entry fee and pays the prize pool out
 * to the placing players per `prizeDistribution`. Placements: final winner = 1,
 * final loser = 2, semi-final losers tie for 3. All movements are idempotent.
 */
async function distributePrizes(tx: Prisma.TransactionClient, tournamentId: string): Promise<void> {
  const t = await tx.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { prizePoolLamports: true, prizeDistribution: true, entryFeeLamports: true },
  });
  const pool = t.prizePoolLamports;
  const tiers = (t.prizeDistribution as unknown as PrizeTier[]) ?? [];

  const matches = await tx.tournamentMatch.findMany({
    where: { tournamentId },
    select: { round: true, winnerId: true, playerOneId: true, playerTwoId: true },
  });
  const finalRound = Math.max(...matches.map((m) => m.round));

  // Resolve placements as TournamentPlayer ids.
  const placement = new Map<number, string[]>();
  const finalMatch = matches.find((m) => m.round === finalRound && m.winnerId);
  if (finalMatch?.winnerId) {
    const champ = finalMatch.winnerId;
    const runnerUp =
      finalMatch.playerOneId === champ ? finalMatch.playerTwoId : finalMatch.playerOneId;
    placement.set(1, [champ]);
    if (runnerUp) placement.set(2, [runnerUp]);
  }
  if (finalRound >= 2) {
    const semiLosers: string[] = [];
    for (const m of matches.filter((x) => x.round === finalRound - 1 && x.winnerId)) {
      const loser = m.playerOneId === m.winnerId ? m.playerTwoId : m.playerOneId;
      if (loser) semiLosers.push(loser);
    }
    if (semiLosers.length) placement.set(3, semiLosers);
  }

  // Map placing player ids → userId, and gather everyone for the forfeit + lock.
  const players = await tx.tournamentPlayer.findMany({
    where: { tournamentId },
    select: { id: true, userId: true },
  });
  const userOf = new Map(players.map((p) => [p.id, p.userId]));

  // Lock all involved balances up front (sorted) to avoid deadlocks.
  await lockBalances(tx, players.map((p) => p.userId));

  // 1. Forfeit each player's locked entry fee (it funds the pool being paid out).
  for (const p of players) {
    await applyEntry(tx, {
      userId: p.userId,
      type: "TOURNAMENT_ENTRY_FORFEIT",
      idempotencyKey: `tourn-forfeit:${tournamentId}:${p.userId}`,
      deltaLocked: -t.entryFeeLamports,
      tournamentId,
      memo: "Tournament entry fee forfeited to prize pool",
    });
  }

  // 2. Pay placements per the distribution (floor by bps; remainder is platform rake).
  for (const tier of tiers) {
    const winners = placement.get(tier.place);
    if (!winners || winners.length === 0) continue;
    const tierTotal = (pool * BigInt(tier.bps)) / 10_000n;
    const share = tierTotal / BigInt(winners.length);
    if (share <= 0n) continue;
    for (const playerId of winners) {
      const userId = userOf.get(playerId);
      if (!userId) continue;
      await applyEntry(tx, {
        userId,
        type: "TOURNAMENT_PRIZE",
        idempotencyKey: `tourn-prize:${tournamentId}:${playerId}:${tier.place}`,
        deltaAvailable: share,
        lifetimeWon: share,
        tournamentId,
        memo: `Tournament prize — placement ${tier.place}`,
      });
      await tx.tournamentPlayer.update({
        where: { id: playerId },
        data: { finalPlacement: tier.place, status: tier.place === 1 ? "WINNER" : undefined },
      });
    }
  }
}

// ─── Cancel (admin): refund every locked entry fee ────────────────────────────

export async function cancelTournament(tournamentId: string): Promise<Tournament> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, entryFeeLamports: true },
  });
  if (!t) throw new TournamentError("NOT_FOUND", "Tournament not found", 404);
  if (t.status === "COMPLETED" || t.status === "CANCELLED") {
    throw new TournamentError("BAD_STATE", "Tournament cannot be cancelled in its current state", 409);
  }

  return prisma.$transaction(async (tx) => {
    const players = await tx.tournamentPlayer.findMany({
      where: { tournamentId, status: { notIn: ["WITHDRAWN"] } },
      select: { userId: true },
    });
    await lockBalances(tx, players.map((p) => p.userId));
    for (const p of players) {
      await applyEntry(tx, {
        userId: p.userId,
        type: "TOURNAMENT_ENTRY_REFUND",
        idempotencyKey: `tourn-refund:${tournamentId}:${p.userId}`,
        deltaLocked: -t.entryFeeLamports,
        deltaAvailable: t.entryFeeLamports,
        tournamentId,
        memo: "Tournament cancelled — entry fee refunded",
      });
    }
    return tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "CANCELLED", prizePoolLamports: 0n },
    });
  });
}

// ─── Read models ──────────────────────────────────────────────────────────────

export async function listTournaments(opts: { status?: string; page: number; limit: number }) {
  const where = opts.status ? { status: opts.status as Tournament["status"] } : {};
  const [rows, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      orderBy: { startTime: "asc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: { _count: { select: { players: true } } },
    }),
    prisma.tournament.count({ where }),
  ]);
  return {
    data: rows.map(toTournamentView),
    meta: { total, page: opts.page, limit: opts.limit },
  };
}

export async function getTournamentDetail(tournamentId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      _count: { select: { players: true } },
      players: { include: { user: { select: { username: true } } }, orderBy: { seed: "asc" } },
      matches: { orderBy: [{ round: "asc" }, { bracketPosition: "asc" }] },
    },
  });
  if (!t) throw new TournamentError("NOT_FOUND", "Tournament not found", 404);
  return {
    tournament: toTournamentView(t),
    players: t.players.map(toPlayerView),
    bracket: t.matches.map(toMatchView),
  };
}
