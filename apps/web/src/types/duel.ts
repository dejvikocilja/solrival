// ─── Duel domain types ────────────────────────────────────────────────────────

export type DuelStatus = 'open' | 'pending' | 'active' | 'completed' | 'cancelled'

export interface Duel {
  id: string
  creatorUsername: string
  creatorAvatar?: string
  stake: number      // SOL
  fee: number        // SOL (platform cut)
  prizePool: number  // stake * 2 - fee
  reward: number     // what winner receives
  game: string
  status: DuelStatus
}

export interface AcceptDuelPayload {
  duelId: string
  friendLink: string
}

// ─── API error ────────────────────────────────────────────────────────────────

export type DuelErrorCode =
  | 'DUEL_NOT_FOUND'
  | 'DUEL_ALREADY_ACCEPTED'
  | 'DUEL_CANCELLED'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_FRIEND_LINK'
  | 'UNKNOWN'

export class DuelApiError extends Error {
  constructor(
    public readonly code: DuelErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DuelApiError'
  }

  toUserMessage(): string {
    const map: Record<DuelErrorCode, string> = {
      DUEL_NOT_FOUND: 'This duel no longer exists.',
      DUEL_ALREADY_ACCEPTED: 'This duel has already been accepted by someone else.',
      DUEL_CANCELLED: 'This duel was cancelled by the creator.',
      INSUFFICIENT_BALANCE: 'Your wallet balance is too low to accept this duel.',
      INVALID_FRIEND_LINK: 'The friend link you entered is not valid.',
      UNKNOWN: 'Something went wrong. Please try again.',
    }
    return map[this.code]
  }
}
