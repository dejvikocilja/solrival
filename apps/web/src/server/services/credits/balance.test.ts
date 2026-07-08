import { describe, it, expect } from "vitest";
import { duelEconomics } from "@solrival/shared";
import { applyEntry, CreditError, type Tx, type EntryInput } from "./balance";

/**
 * Ledger unit tests — the invariants that keep the custodial credits system
 * honest, exercised through an in-memory fake Prisma TransactionClient that
 * implements exactly the surface `applyEntry` touches. No database.
 *
 * The lifecycle tests at the bottom replay the SAME sequences of entries the
 * duel services write (stake lock → settle / refund / overturn / void) and
 * assert value conservation, so a change to the settlement math that breaks
 * reconciliation fails here before it ever reaches a ledger.
 */

// ─── In-memory fake TransactionClient ────────────────────────────────────────

interface FakeBalance {
  userId: string;
  availableLamports: bigint;
  lockedLamports: bigint;
  version: number;
  lifetimeDepositedLamports: bigint;
  lifetimeWithdrawnLamports: bigint;
  lifetimeWonLamports: bigint;
}

interface FakeLedgerRow {
  id: string;
  idempotencyKey: string;
  deltaAvailable: bigint;
  deltaLocked: bigint;
  availableAfter: bigint;
  lockedAfter: bigint;
  userId: string;
  [k: string]: unknown;
}

function makeFakeTx(seed: Array<{ userId: string; available?: bigint; locked?: bigint }> = []) {
  const balances = new Map<string, FakeBalance>();
  const entries: FakeLedgerRow[] = [];

  const blank = (userId: string): FakeBalance => ({
    userId,
    availableLamports: 0n,
    lockedLamports: 0n,
    version: 0,
    lifetimeDepositedLamports: 0n,
    lifetimeWithdrawnLamports: 0n,
    lifetimeWonLamports: 0n,
  });
  for (const s of seed) {
    balances.set(s.userId, {
      ...blank(s.userId),
      availableLamports: s.available ?? 0n,
      lockedLamports: s.locked ?? 0n,
    });
  }

  const inc = (current: bigint, patch: unknown): bigint => {
    if (typeof patch === "bigint") return patch; // direct set
    if (patch && typeof patch === "object" && "increment" in patch) {
      return current + BigInt((patch as { increment: bigint | number }).increment);
    }
    return current;
  };

  const tx = {
    userBalance: {
      upsert: async ({ where, create }: { where: { userId: string }; create: { userId: string } }) => {
        if (!balances.has(where.userId)) balances.set(where.userId, blank(create.userId));
        return { ...balances.get(where.userId)! };
      },
      findUniqueOrThrow: async ({ where }: { where: { userId: string } }) => {
        const b = balances.get(where.userId);
        if (!b) throw new Error(`balance not found: ${where.userId}`);
        return { ...b };
      },
      update: async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
        const b = balances.get(where.userId);
        if (!b) throw new Error(`balance not found: ${where.userId}`);
        if (data.availableLamports !== undefined) b.availableLamports = data.availableLamports as bigint;
        if (data.lockedLamports !== undefined) b.lockedLamports = data.lockedLamports as bigint;
        b.version = Number(inc(BigInt(b.version), data.version));
        b.lifetimeDepositedLamports = inc(b.lifetimeDepositedLamports, data.lifetimeDepositedLamports);
        b.lifetimeWithdrawnLamports = inc(b.lifetimeWithdrawnLamports, data.lifetimeWithdrawnLamports);
        b.lifetimeWonLamports = inc(b.lifetimeWonLamports, data.lifetimeWonLamports);
        return { ...b };
      },
    },
    ledgerEntry: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }: { data: Omit<FakeLedgerRow, "id"> }) => {
        const row = { id: `le_${entries.length + 1}`, ...data } as FakeLedgerRow;
        entries.push(row);
        return row;
      },
    },
    $queryRaw: async () => [] as unknown[],
  };

  return { tx: tx as unknown as Tx, balances, entries };
}

const apply = (tx: Tx, input: Partial<EntryInput> & Pick<EntryInput, "userId" | "idempotencyKey">) =>
  applyEntry(tx, { type: "ADMIN_ADJUSTMENT", ...input } as EntryInput);

const SOL = 1_000_000_000n;

// ─── Core invariants ─────────────────────────────────────────────────────────

describe("applyEntry invariants", () => {
  it("records signed deltas and correct post-mutation snapshots", async () => {
    const { tx, balances } = makeFakeTx([{ userId: "u1", available: 5n * SOL }]);

    const entry = await apply(tx, {
      userId: "u1",
      type: "STAKE_LOCK",
      idempotencyKey: "k1",
      deltaAvailable: -2n * SOL,
      deltaLocked: 2n * SOL,
    });

    expect(entry.availableAfter).toBe(3n * SOL);
    expect(entry.lockedAfter).toBe(2n * SOL);
    const b = balances.get("u1")!;
    expect(b.availableLamports).toBe(3n * SOL);
    expect(b.lockedLamports).toBe(2n * SOL);
    expect(b.version).toBe(1);
  });

  it("never lets available go negative — throws INSUFFICIENT_FUNDS and writes nothing", async () => {
    const { tx, balances, entries } = makeFakeTx([{ userId: "u1", available: 1n * SOL }]);

    await expect(
      apply(tx, { userId: "u1", idempotencyKey: "k1", deltaAvailable: -2n * SOL }),
    ).rejects.toMatchObject({ name: "CreditError", code: "INSUFFICIENT_FUNDS" });

    expect(entries).toHaveLength(0);
    expect(balances.get("u1")!.availableLamports).toBe(1n * SOL); // untouched
  });

  it("never lets locked go negative — throws LOCKED_UNDERFLOW and writes nothing", async () => {
    const { tx, entries } = makeFakeTx([{ userId: "u1", locked: 1n }]);

    await expect(
      apply(tx, { userId: "u1", idempotencyKey: "k1", deltaLocked: -2n }),
    ).rejects.toMatchObject({ code: "LOCKED_UNDERFLOW" });
    expect(entries).toHaveLength(0);
  });

  it("is exactly-once: a replayed idempotency key returns the original entry unchanged", async () => {
    const { tx, balances, entries } = makeFakeTx([{ userId: "u1", available: 5n * SOL }]);

    const first = await apply(tx, { userId: "u1", idempotencyKey: "dup", deltaAvailable: -1n * SOL });
    const second = await apply(tx, { userId: "u1", idempotencyKey: "dup", deltaAvailable: -1n * SOL });

    expect(second).toBe(first as unknown as typeof second); // same row, not a re-application
    expect(entries).toHaveLength(1);
    expect(balances.get("u1")!.availableLamports).toBe(4n * SOL); // debited once
  });

  it("creates a zero balance row for a new user rather than failing", async () => {
    const { tx, balances } = makeFakeTx();
    const entry = await apply(tx, { userId: "new", idempotencyKey: "k1", deltaAvailable: 1n * SOL });
    expect(entry.availableAfter).toBe(1n * SOL);
    expect(balances.get("new")!.availableLamports).toBe(1n * SOL);
  });

  it("applies negative lifetime increments (used by dispute reversals)", async () => {
    const { tx, balances } = makeFakeTx([{ userId: "u1", available: 5n * SOL }]);
    await apply(tx, { userId: "u1", idempotencyKey: "k1", deltaAvailable: -1n * SOL, lifetimeWon: -1n * SOL });
    expect(balances.get("u1")!.lifetimeWonLamports).toBe(-1n * SOL);
  });

  it("exposes machine-readable errors (code + HTTP status) for the API layer", () => {
    const err = new CreditError("INSUFFICIENT_FUNDS", "x", 402);
    expect(err.status).toBe(402);
    expect(err.code).toBe("INSUFFICIENT_FUNDS");
  });
});

// ─── Lifecycle conservation ──────────────────────────────────────────────────
//
// These replay the exact entry sequences the duel services write and assert
// that total user value + platform rake always reconciles. userId "w" wins,
// "l" loses; both start with 10 SOL available; stake 1 SOL; rake 10%.

const STAKE = 1n * SOL;
const FEE_BPS = 1_000;
const START = 10n * SOL;

function totalUserValue(balances: Map<string, FakeBalance>): bigint {
  let sum = 0n;
  for (const b of balances.values()) sum += b.availableLamports + b.lockedLamports;
  return sum;
}

async function lockStakes(tx: Tx) {
  for (const u of ["w", "l"]) {
    await apply(tx, {
      userId: u,
      type: "STAKE_LOCK",
      idempotencyKey: `lock:${u}`,
      deltaAvailable: -STAKE,
      deltaLocked: STAKE,
    });
  }
}

/** Mirrors settleCreditDuel's entries: loser forfeits lock; winner's lock releases into the reward. */
async function settle(tx: Tx) {
  const { reward, netWinnings } = duelEconomics(STAKE, FEE_BPS);
  await apply(tx, {
    userId: "l",
    type: "STAKE_FORFEIT",
    idempotencyKey: "forfeit:l",
    deltaLocked: -STAKE,
  });
  await apply(tx, {
    userId: "w",
    type: "DUEL_PAYOUT",
    idempotencyKey: "payout:w",
    deltaAvailable: reward,
    deltaLocked: -STAKE,
    lifetimeWon: netWinnings,
  });
}

describe("duel lifecycle conservation", () => {
  it("lock + settle: winner nets +netWinnings, loser -stake, platform keeps exactly the rake", async () => {
    const { tx, balances } = makeFakeTx([
      { userId: "w", available: START },
      { userId: "l", available: START },
    ]);
    const { rake, netWinnings } = duelEconomics(STAKE, FEE_BPS);

    await lockStakes(tx);
    await settle(tx);

    const w = balances.get("w")!;
    const l = balances.get("l")!;
    expect(w.availableLamports).toBe(START + netWinnings);
    expect(l.availableLamports).toBe(START - STAKE);
    expect(w.lockedLamports).toBe(0n);
    expect(l.lockedLamports).toBe(0n);
    // Value that left the users equals the rake — nothing else leaks.
    expect(2n * START - totalUserValue(balances)).toBe(rake);
  });

  it("lock + refund restores both players exactly (unverifiable-duel timeout path)", async () => {
    const { tx, balances } = makeFakeTx([
      { userId: "w", available: START },
      { userId: "l", available: START },
    ]);
    await lockStakes(tx);
    for (const u of ["w", "l"]) {
      await apply(tx, {
        userId: u,
        type: "STAKE_REFUND",
        idempotencyKey: `refund:${u}`,
        deltaAvailable: STAKE,
        deltaLocked: -STAKE,
      });
    }
    for (const u of ["w", "l"]) {
      expect(balances.get(u)!.availableLamports).toBe(START);
      expect(balances.get(u)!.lockedLamports).toBe(0n);
    }
  });

  it("settle + overturn moves exactly the reward and lands on the mirrored end-state", async () => {
    const { tx, balances } = makeFakeTx([
      { userId: "w", available: START },
      { userId: "l", available: START },
    ]);
    const { reward, netWinnings } = duelEconomics(STAKE, FEE_BPS);

    await lockStakes(tx);
    await settle(tx);
    // Mirrors overturnCreditSettlement's two entries.
    await apply(tx, {
      userId: "w",
      idempotencyKey: "overturn-clawback",
      deltaAvailable: -reward,
      lifetimeWon: -netWinnings,
    });
    await apply(tx, {
      userId: "l",
      idempotencyKey: "overturn-payout",
      deltaAvailable: reward,
      lifetimeWon: netWinnings,
    });

    // End state must be exactly "l won instead": l has +netWinnings, w has -stake.
    expect(balances.get("l")!.availableLamports).toBe(START + netWinnings);
    expect(balances.get("w")!.availableLamports).toBe(START - STAKE);
    expect(balances.get("w")!.lifetimeWonLamports).toBe(0n); // reverted
    expect(balances.get("l")!.lifetimeWonLamports).toBe(netWinnings);
  });

  it("settle + void restores BOTH players to their pre-duel balance (platform returns the rake)", async () => {
    const { tx, balances } = makeFakeTx([
      { userId: "w", available: START },
      { userId: "l", available: START },
    ]);
    const { netWinnings } = duelEconomics(STAKE, FEE_BPS);

    await lockStakes(tx);
    await settle(tx);
    // Mirrors refundSettledCreditDuel's two entries.
    await apply(tx, {
      userId: "w",
      idempotencyKey: "void-winner",
      deltaAvailable: -netWinnings,
      lifetimeWon: -netWinnings,
    });
    await apply(tx, { userId: "l", idempotencyKey: "void-loser", deltaAvailable: STAKE });

    expect(balances.get("w")!.availableLamports).toBe(START);
    expect(balances.get("l")!.availableLamports).toBe(START);
    expect(totalUserValue(balances)).toBe(2n * START); // rake fully returned
  });

  it("a re-run settlement sweep changes nothing (idempotency end-to-end)", async () => {
    const { tx, balances, entries } = makeFakeTx([
      { userId: "w", available: START },
      { userId: "l", available: START },
    ]);
    await lockStakes(tx);
    await settle(tx);
    const snapshot = JSON.stringify([...balances.entries()], (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const count = entries.length;

    await settle(tx); // replay — e.g. a crashed sweep retried

    expect(entries.length).toBe(count);
    expect(
      JSON.stringify([...balances.entries()], (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    ).toBe(snapshot);
  });
});
