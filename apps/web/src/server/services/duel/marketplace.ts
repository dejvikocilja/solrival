import "server-only";
import { computeSettlement } from "@solrival/sdk";
import type { ListDuelsQuery } from "@solrival/shared";
import { listJoinableDuels } from "./repo";

function shortenWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export type MarketplaceDuel = {
  id: string;
  shortCode: string;
  game: "CLASH_ROYALE" | "BRAWL_STARS";
  stakeLamports: string;
  potLamports: string;
  rewardLamports: string;
  platformFeeBps: number;
  expiresAt: string;
  rule: { template: string; displayName: string } | null;
  creator: { username: string; walletShort: string; wins: number; losses: number };
  stats: { trophies: number | null; accountLevel: number | null; winRateBps: number | null; verified: boolean } | null;
};

export type MarketplacePage = { duels: MarketplaceDuel[]; nextCursor: string | null };

export async function getMarketplace(q: ListDuelsQuery): Promise<MarketplacePage> {
  const rows = await listJoinableDuels(q);

  const duels: MarketplaceDuel[] = rows.map((d) => {
    const { pot, payout } = computeSettlement(d.stakeLamports, d.platformFeeBps);
    return {
      id: d.id,
      shortCode: d.shortCode,
      game: d.game,
      stakeLamports: d.stakeLamports.toString(),
      potLamports: pot.toString(),
      rewardLamports: payout.toString(),
      platformFeeBps: d.platformFeeBps,
      expiresAt: d.expiresAt.toISOString(),
      rule: d.rule ? { template: d.rule.template, displayName: d.rule.displayName } : null,
      creator: {
        username: d.creator.username,
        walletShort: shortenWallet(d.creator.walletAddress),
        wins: d.creator.wins,
        losses: d.creator.losses,
      },
      stats: d.creatorGameAccount
        ? {
            trophies: d.creatorGameAccount.trophies,
            accountLevel: d.creatorGameAccount.accountLevel,
            winRateBps: d.creatorGameAccount.winRateBps,
            verified: d.creatorGameAccount.verified,
          }
        : null,
    };
  });

  const nextCursor = rows.length === q.limit ? (rows[rows.length - 1]?.id ?? null) : null;
  return { duels, nextCursor };
}
