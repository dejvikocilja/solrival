import type { DuelVisibility, Game, RuleTemplate } from "@solrival/shared";
import { apiPost } from "./client";

/**
 * Public-safe duel shape returned by the API. Mirrors `toDuelSummary` on the
 * server; BigInt fields arrive as decimal strings, dates as ISO strings.
 */
export interface DuelSummary {
  id: string;
  shortCode: string;
  game: Game;
  visibility: DuelVisibility;
  status:
    | "CREATED"
    | "WAITING_FOR_OPPONENT"
    | "ACCEPTED"
    | "ACTIVE"
    | "SETTLED"
    | "CANCELLED"
    | "EXPIRED";
  creatorId: string;
  opponentId: string | null;
  stakeLamports: string;
  platformFeeBps: number;
  escrowPda: string | null;
  inviteToken: string | null;
  expiresAt: string;
  createdAt: string;
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
