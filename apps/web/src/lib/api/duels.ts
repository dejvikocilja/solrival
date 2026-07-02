import type { DuelVisibility, Game, RuleTemplate, DuelStatus } from "@solrival/shared";
import { apiGet, apiPost } from "./client";

/**
 * The duel status union is the SINGLE canonical one from @solrival/shared, which
 * mirrors the Prisma `DuelStatus` enum. It is re-exported here so existing UI
 * imports (`import { type DuelStatus } from "@/lib/api/duels"`) resolve to it.
 *
 * Do NOT redeclare the values locally — a stale copy here (missing COMPLETED /
 * VERIFYING / DISPUTED / REFUNDED, with a bogus "SETTLED") is what made the duel
 * detail page crash on finished duels.
 */
export type { DuelStatus };

/**
 * Public-safe duel shape returned by the API. Mirrors `toDuelSummary` on the
 * server; BigInt fields arrive as decimal strings, dates as ISO strings.
 */
export interface DuelSummary {
  id: string;
  shortCode: string;
  game: Game;
  visibility: DuelVisibility;
  status: DuelStatus;
  creatorId: string;
  opponentId: string | null;
  stakeLamports: string;
  platformFeeBps: number;
  escrowPda: string | null;
  inviteToken: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Identity for a duel participant (creator / opponent). */
export interface DuelParticipant {
  id: string;
  username: string;
  walletAddress: string;
}

/** Full duel detail returned by GET /api/duels/[id]. */
export interface DuelDetail {
  id: string;
  shortCode: string;
  game: Game;
  visibility: DuelVisibility;
  status: DuelStatus;
  stakeLamports: string;
  platformFeeBps: number;
  escrowPda: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  /** Winner's user id, set only once the duel reaches COMPLETED; null otherwise. */
  winnerId: string | null;
  /** Lamports paid to the winner at settlement, as a decimal string; null until then. */
  winnerPayoutLamports: string | null;
  creator: DuelParticipant;
  opponent: DuelParticipant | null;
  rule: { template: RuleTemplate; displayName: string } | null;
}

export interface DuelEconomics {
  stakeLamports: string;
  platformFeeBps: number;
  potLamports: string;
  feeLamports: string;
  rewardLamports: string;
}

export interface CreateDuelResponse {
  duel: DuelSummary;
  economics: DuelEconomics;
}

/** Body accepted by POST /api/duels — stake is lamports as a decimal string. */
export type CreateDuelBody = {
  game: Game;
  ruleTemplate: RuleTemplate;
  visibility: DuelVisibility;
  stakeLamports: string;
  friendLink: string;
};

/**
 * Creates a duel under the credits model. The server locks the stake from the
 * creator's SolRival balance and opens the duel immediately — there is no wallet
 * signature or on-chain deposit step, so the live duel is returned right away.
 */
export function createDuel(body: CreateDuelBody): Promise<CreateDuelResponse> {
  return apiPost<CreateDuelResponse>("/api/duels", body);
}

/**
 * Fetches a single duel by its UUID. `inviteToken` is required to view a
 * PRIVATE duel you don't participate in (the marketplace only links public ones).
 */
export function getDuel(id: string, inviteToken?: string | null): Promise<{ duel: DuelDetail }> {
  const query = inviteToken ? `?token=${encodeURIComponent(inviteToken)}` : "";
  return apiGet<{ duel: DuelDetail }>(`/api/duels/${id}${query}`);
}

/** Accepts an open duel — locks the opponent's stake from their balance. */
export function acceptDuel(id: string, friendLink: string): Promise<unknown> {
  return apiPost<unknown>(`/api/duels/${id}/accept`, { friendLink });
}

/** Raises a dispute on a live/verifying duel — freezes settlement for admin review. */
export function disputeDuel(id: string, reason: string): Promise<{ disputed: boolean }> {
  return apiPost<{ disputed: boolean }>(`/api/duels/${id}/dispute`, { reason });
}
