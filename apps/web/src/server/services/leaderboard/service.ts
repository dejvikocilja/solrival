import "server-only";
import { Prisma, prisma } from "@solrival/db";

export type LeaderboardPeriod = "day" | "week" | "all";

export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ["day", "week", "all"];

export const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  day: "Today",
  week: "This week",
  all: "All time",
};

/**
 * Board size.
 *
 * A leaderboard is a shortlist, not a directory: ranking every player turns an
 * aspirational page into an unreadable scroll the moment the platform has real
 * volume, and the hundredth name means nothing to anyone. Capped deliberately.
 */
export const LEADERBOARD_LIMIT = 20;

export type LeaderboardEntry = {
  rank: number;
  id: string;
  username: string;
  walletAddress: string;
  wins: number;
  losses: number;
  played: number;
  /** Win percentage 0–100, or null when the player has no settled duels yet. */
  winRate: number | null;
};

function periodStart(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (period === "day") return startOfToday;
  return new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000); // rolling 7 days
}

/**
 * Ranks players by duels won.
 *
 * All-time reads the denormalized `User.wins` counter — cheap, and it is the
 * canonical lifetime record. Day and week cannot: those counters have no time
 * dimension, so windowed standings are aggregated from settled duels instead.
 * A player's wins and losses in the window are counted from the duel rows
 * themselves, which means the two paths can disagree only if the counters have
 * drifted from the duel table — a bug worth surfacing rather than hiding.
 *
 * Ties break to fewest losses, then earliest joined, so the same standings
 * never reshuffle between requests.
 */
export async function getLeaderboard(
  period: LeaderboardPeriod = "all",
  limit: number = LEADERBOARD_LIMIT,
): Promise<LeaderboardEntry[]> {
  const since = periodStart(period);

  if (since === null) {
    const users = await prisma.user.findMany({
      where: {
        suspended: false,
        OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }],
      },
      orderBy: [{ wins: "desc" }, { losses: "asc" }, { createdAt: "asc" }],
      take: limit,
      select: { id: true, username: true, walletAddress: true, wins: true, losses: true },
    });
    return users.map(toEntry);
  }

  // Windowed standings, aggregated in SQL. Each settled duel contributes one
  // win to its winner and one loss to the other participant; duels with no
  // winner (refunded, voided) contribute nothing to either.
  const rows = await prisma.$queryRaw<
    { id: string; username: string; walletAddress: string; wins: bigint; losses: bigint }[]
  >(Prisma.sql`
    WITH results AS (
      SELECT d.winner_id AS user_id, 1 AS win, 0 AS loss
      FROM duels d
      WHERE d.status = 'COMPLETED'
        AND d.winner_id IS NOT NULL
        AND d.settled_at >= ${since}
      UNION ALL
      SELECT
        CASE WHEN d.winner_id = d.creator_id THEN d.opponent_id ELSE d.creator_id END AS user_id,
        0 AS win, 1 AS loss
      FROM duels d
      WHERE d.status = 'COMPLETED'
        AND d.winner_id IS NOT NULL
        AND d.opponent_id IS NOT NULL
        AND d.settled_at >= ${since}
    )
    SELECT
      u.id                       AS id,
      u.username                 AS username,
      u.wallet_address           AS "walletAddress",
      SUM(r.win)::bigint         AS wins,
      SUM(r.loss)::bigint        AS losses
    FROM results r
    JOIN users u ON u.id = r.user_id
    WHERE u.suspended = false
    GROUP BY u.id, u.username, u.wallet_address, u.created_at
    ORDER BY wins DESC, losses ASC, u.created_at ASC
    LIMIT ${limit}
  `);

  return rows.map((r, i) =>
    toEntry(
      {
        id: r.id,
        username: r.username,
        walletAddress: r.walletAddress,
        wins: Number(r.wins),
        losses: Number(r.losses),
      },
      i,
    ),
  );
}

function toEntry(
  u: { id: string; username: string; walletAddress: string; wins: number; losses: number },
  i: number,
): LeaderboardEntry {
  const played = u.wins + u.losses;
  return {
    rank: i + 1,
    id: u.id,
    username: u.username,
    walletAddress: u.walletAddress,
    wins: u.wins,
    losses: u.losses,
    played,
    winRate: played > 0 ? Math.round((u.wins / played) * 100) : null,
  };
}
