import "server-only";
import { Prisma, prisma } from "@solrival/db";
import {
  type Bucket,
  type RangeSelection,
  PRESET_DAYS,
  bucketForSpanDays,
  parseIsoDate,
} from "@/lib/admin/analytics-range";
import type { AnalyticsSnapshot } from "@/lib/admin/analytics-types";

export type { AnalyticsSnapshot } from "@/lib/admin/analytics-types";

/**
 * Admin analytics.
 *
 * Previously the dashboard page queried Prisma inline and the API route kept a
 * second, divergent copy of the same logic — the page loaded every completed
 * duel into memory to sum it, which is fine at 17 duels and fatal at 170,000.
 * Both now call this one module, and every aggregate is computed in SQL.
 */

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Resolved absolute window. `to` is exclusive so day boundaries never
 *  double-count a duel created at exactly midnight. */
export interface ResolvedRange {
  from: Date;
  toExclusive: Date;
  bucket: Bucket;
  spanDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ceiling on custom ranges, so a hand-crafted URL can't ask for a million
 *  buckets and pin the database. */
const MAX_SPAN_DAYS = 3650;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Turns a selection into an absolute window. For "all", the start is the
 * earliest row the platform has — queried, not guessed, so the chart begins
 * where the data begins instead of at an arbitrary epoch.
 */
export async function resolveRange(sel: RangeSelection): Promise<ResolvedRange> {
  const todayStart = startOfUtcDay(new Date());
  const toExclusive = new Date(todayStart.getTime() + DAY_MS); // include all of today

  if (sel.kind === "custom") {
    const from = parseIsoDate(sel.from);
    const to = parseIsoDate(sel.to);
    if (!from || !to || from > to) {
      throw new AnalyticsRangeError("Invalid custom range");
    }
    const end = new Date(to.getTime() + DAY_MS); // inclusive of the `to` day
    const spanDays = Math.round((end.getTime() - from.getTime()) / DAY_MS);
    if (spanDays > MAX_SPAN_DAYS) {
      throw new AnalyticsRangeError(`Range cannot exceed ${MAX_SPAN_DAYS} days`);
    }
    return { from, toExclusive: end, bucket: bucketForSpanDays(spanDays), spanDays };
  }

  if (sel.preset === "all") {
    const first = await prisma.duel.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const from = first ? startOfUtcDay(first.createdAt) : new Date(todayStart.getTime() - 29 * DAY_MS);
    const spanDays = Math.max(1, Math.round((toExclusive.getTime() - from.getTime()) / DAY_MS));
    return { from, toExclusive, bucket: bucketForSpanDays(spanDays), spanDays };
  }

  const days = PRESET_DAYS[sel.preset];
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  return { from, toExclusive, bucket: bucketForSpanDays(days), spanDays: days };
}

export class AnalyticsRangeError extends Error {
  status = 400;
  code = "INVALID_RANGE";
}

function lamportsToSol(l: bigint): number {
  // Stay in bigint until the final divide so large sums don't lose precision.
  return Number((l * 10_000n) / LAMPORTS_PER_SOL) / 10_000;
}

/** Maps a bucket to the Postgres date_trunc unit. Never interpolated from user
 *  input — only from this closed set — so it cannot carry SQL injection. */
const TRUNC_UNIT: Record<Bucket, string> = { day: "day", week: "week", month: "month" };

type BucketRow = { bucket: Date; count: bigint; lamports: bigint };

/**
 * Zero-filled time series in one query. `generate_series` produces every bucket
 * in the window and the LEFT JOIN attaches counts, so gaps render as zeroes
 * rather than the chart silently closing over missing days.
 */
async function duelSeries(range: ResolvedRange): Promise<BucketRow[]> {
  const unit = TRUNC_UNIT[range.bucket];
  return prisma.$queryRaw<BucketRow[]>`
    SELECT
      g.bucket                                                   AS bucket,
      COALESCE(COUNT(d.id), 0)::bigint                           AS count,
      COALESCE(SUM(d.stake_lamports * 2), 0)::bigint             AS lamports
    FROM generate_series(
      date_trunc(${Prisma.raw(`'${unit}'`)}, ${range.from}::timestamptz),
      ${range.toExclusive}::timestamptz - interval '1 microsecond',
      ${Prisma.raw(`'1 ${unit}'`)}::interval
    ) AS g(bucket)
    LEFT JOIN duels d
      ON d.created_at >= g.bucket
     AND d.created_at <  g.bucket + ${Prisma.raw(`'1 ${unit}'`)}::interval
     AND d.created_at >= ${range.from}
     AND d.created_at <  ${range.toExclusive}
    GROUP BY g.bucket
    ORDER BY g.bucket ASC
  `;
}

async function signupSeries(range: ResolvedRange): Promise<{ bucket: Date; count: bigint }[]> {
  const unit = TRUNC_UNIT[range.bucket];
  return prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
    SELECT
      g.bucket                          AS bucket,
      COALESCE(COUNT(u.id), 0)::bigint  AS count
    FROM generate_series(
      date_trunc(${Prisma.raw(`'${unit}'`)}, ${range.from}::timestamptz),
      ${range.toExclusive}::timestamptz - interval '1 microsecond',
      ${Prisma.raw(`'1 ${unit}'`)}::interval
    ) AS g(bucket)
    LEFT JOIN users u
      ON u.created_at >= g.bucket
     AND u.created_at <  g.bucket + ${Prisma.raw(`'1 ${unit}'`)}::interval
     AND u.created_at >= ${range.from}
     AND u.created_at <  ${range.toExclusive}
    GROUP BY g.bucket
    ORDER BY g.bucket ASC
  `;
}

/** Scoped totals for the selected window. */
async function windowTotals(from: Date, toExclusive: Date) {
  const [totals, players] = await Promise.all([
    prisma.$queryRaw<[{ duels: bigint; volume: bigint; fees: bigint }]>`
      SELECT
        COUNT(*)::bigint                                                                        AS duels,
        COALESCE(SUM(stake_lamports * 2) FILTER (WHERE status = 'COMPLETED'), 0)::bigint        AS volume,
        COALESCE(SUM(fee_collected_lamports) FILTER (WHERE status = 'COMPLETED'), 0)::bigint    AS fees
      FROM duels
      WHERE created_at >= ${from} AND created_at < ${toExclusive}
    `,
    prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(DISTINCT player_id)::bigint AS cnt
      FROM (
        SELECT creator_id AS player_id FROM duels
          WHERE created_at >= ${from} AND created_at < ${toExclusive}
        UNION ALL
        SELECT opponent_id AS player_id FROM duels
          WHERE created_at >= ${from} AND created_at < ${toExclusive} AND opponent_id IS NOT NULL
      ) sub
    `,
  ]);

  return {
    duels: Number(totals[0]?.duels ?? 0n),
    volumeLamports: totals[0]?.volume ?? 0n,
    feesLamports: totals[0]?.fees ?? 0n,
    activePlayers: Number(players[0]?.cnt ?? 0n),
  };
}

const GAME_LABELS: Record<string, string> = {
  CLASH_ROYALE: "Clash Royale",
  BRAWL_STARS: "Brawl Stars",
  EA_FC: "EA Sports FC",
  CS2: "Counter-Strike 2",
};

export async function getAnalyticsSnapshot(
  sel: RangeSelection,
  label: string,
): Promise<AnalyticsSnapshot> {
  const range = await resolveRange(sel);

  const [
    current,
    lifetime,
    activeDuels,
    tournaments,
    duelRows,
    signupRows,
    splitRows,
  ] = await Promise.all([
    windowTotals(range.from, range.toExclusive),
    prisma.$queryRaw<[{ duels: bigint; volume: bigint; fees: bigint }]>`
      SELECT
        COUNT(*)::bigint                                                                     AS duels,
        COALESCE(SUM(stake_lamports * 2) FILTER (WHERE status = 'COMPLETED'), 0)::bigint     AS volume,
        COALESCE(SUM(fee_collected_lamports) FILTER (WHERE status = 'COMPLETED'), 0)::bigint AS fees
      FROM duels
    `,
    prisma.duel.count({ where: { status: { in: ["ACTIVE", "VERIFYING"] } } }),
    prisma.tournament.count({
      where: { createdAt: { gte: range.from, lt: range.toExclusive } },
    }),
    duelSeries(range),
    signupSeries(range),
    prisma.$queryRaw<{ game: string; matches: bigint }[]>`
      SELECT game, COUNT(*)::bigint AS matches
      FROM duels
      WHERE status = 'COMPLETED'
        AND created_at >= ${range.from} AND created_at < ${range.toExclusive}
      GROUP BY game
      ORDER BY matches DESC
    `,
  ]);

  const bucketKey = (d: Date) => d.toISOString().slice(0, 10);

  return {
    range: {
      from: bucketKey(range.from),
      to: bucketKey(new Date(range.toExclusive.getTime() - DAY_MS)),
      bucket: range.bucket,
      label,
    },
    duels: current.duels,
    volumeSol: lamportsToSol(current.volumeLamports),
    feesSol: lamportsToSol(current.feesLamports),
    tournaments,
    activePlayers: current.activePlayers,
    activeDuels,
    lifetime: {
      duels: Number(lifetime[0]?.duels ?? 0n),
      volumeSol: lamportsToSol(lifetime[0]?.volume ?? 0n),
      feesSol: lamportsToSol(lifetime[0]?.fees ?? 0n),
    },
    duelsPerDay: duelRows.map((r) => ({ date: bucketKey(r.bucket), count: Number(r.count) })),
    volumePerDay: duelRows.map((r) => ({ date: bucketKey(r.bucket), sol: lamportsToSol(r.lamports) })),
    playersPerDay: signupRows.map((r) => ({ date: bucketKey(r.bucket), count: Number(r.count) })),
    gameSplit: splitRows.map((r) => ({
      game: GAME_LABELS[r.game] ?? r.game,
      matches: Number(r.matches),
    })),
  };
}
