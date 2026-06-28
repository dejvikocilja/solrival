import "server-only";
import { computeSettlement } from "@solrival/sdk";
import { listUserDuels } from "./repo";

function shortenWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export type MyDuel = {
  id: string;
  shortCode: string;
  game: "CLASH_ROYALE" | "BRAWL_STARS";
  status: string;
  role: "creator" | "opponent";
  visibility: "PUBLIC" | "PRIVATE";
  stakeLamports: string;
  potLamports: string;
  rewardLamports: string;
  platformFeeBps: number;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
  winnerId: string | null;
  youWon: boolean | null;
  inviteToken: string | null;
  rule: { template: string; displayName: string } | null;
  creator: { username: string; walletShort: string };
  opponent: { username: string; walletShort: string } | null;
};

/** Every duel the user created or accepted, newest first, with economics + outcome. */
export async function getMyDuels(userId: string): Promise<{ duels: MyDuel[] }> {
  const rows = await listUserDuels(userId);
  const duels: MyDuel[] = rows.map((d) => {
    const { pot, payout } = computeSettlement(d.stakeLamports, d.platformFeeBps);
    return {
      id: d.id,
      shortCode: d.shortCode,
      game: d.game,
      status: d.status,
      role: d.creatorId === userId ? "creator" : "opponent",
      visibility: d.visibility,
      stakeLamports: d.stakeLamports.toString(),
      potLamports: pot.toString(),
      rewardLamports: payout.toString(),
      platformFeeBps: d.platformFeeBps,
      createdAt: d.createdAt.toISOString(),
      expiresAt: d.expiresAt.toISOString(),
      settledAt: d.settledAt ? d.settledAt.toISOString() : null,
      winnerId: d.winnerId,
      youWon: d.status === "COMPLETED" && d.winnerId ? d.winnerId === userId : null,
      inviteToken: d.inviteToken,
      rule: d.rule ? { template: d.rule.template, displayName: d.rule.displayName } : null,
      creator: { username: d.creator.username, walletShort: shortenWallet(d.creator.walletAddress) },
      opponent: d.opponent
        ? { username: d.opponent.username, walletShort: shortenWallet(d.opponent.walletAddress) }
        : null,
    };
  });
  return { duels };
}