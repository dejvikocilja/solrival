import { apiGet, apiPut } from "@/lib/api/client";
import type { Game } from "@solrival/shared";

export interface GameAccountView {
  game: Game;
  inGameTag: string;
  /** Present right after linking (fresh from the game API); null on list reads. */
  inGameName: string | null;
  friendLink: string | null;
  trophies: number | null;
  lastSyncedAt: string | null;
}

export function getGameAccounts(): Promise<{ accounts: GameAccountView[] }> {
  return apiGet<{ accounts: GameAccountView[] }>("/api/game-accounts");
}

export function linkGameAccount(input: {
  game: Game;
  playerTag: string;
  friendLink: string;
}): Promise<{ account: GameAccountView }> {
  return apiPut<{ account: GameAccountView }>("/api/game-accounts", input);
}
