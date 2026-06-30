import "server-only";
import { prisma } from "@solrival/db";

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

/**
 * Ranks players by total duels won (the denormalized, duel-result-sourced
 * `User.wins`). Ties break to fewest losses, then earliest joined — fully
 * deterministic so the same standings never reshuffle between requests.
 * Only players with at least one settled duel and who aren't suspended appear.
 */
export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const users = await prisma.user.findMany({
    where: {
      suspended: false,
      OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }],
    },
    orderBy: [{ wins: "desc" }, { losses: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true, username: true, walletAddress: true, wins: true, losses: true },
  });

  return users.map((u, i) => {
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
  });
}
