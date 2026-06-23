import type { DuelVisibility, Game, RuleTemplate } from "@solrival/shared";
import { apiGet, apiPost } from "./client";

export type DuelStatus =
  | "CREATED"
  | "WAITING_FOR_OPPONENT"
  | "ACCEPTED"
  | "ACTIVE"
  | "SETTLED"
  | "CANCELLED"
  | "EXPIRED";

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
