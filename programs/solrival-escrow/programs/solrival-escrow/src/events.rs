use anchor_lang::prelude::*;

#[event]
pub struct DuelEscrowCreated {
    pub duel_id: [u8; 32],
    pub duel_escrow: Pubkey,
    pub creator: Pubkey,
    pub stake_lamports: u64,
    pub fee_bps: u16,
    pub expires_at: i64,
}

#[event]
pub struct StakeDeposited {
    pub duel_id: [u8; 32],
    pub challenger: Pubkey,
    pub accepted_at: i64,
}

#[event]
pub struct PayoutFinalized {
    pub duel_id: [u8; 32],
    pub winner: Pubkey,
    pub payout_lamports: u64,
    pub fee_lamports: u64,
}

#[event]
pub struct EscrowRefunded {
    pub duel_id: [u8; 32],
    /// 0 = Created-state refund (creator only), 1 = Active-state refund (both players)
    pub reason: u8,
}

#[event]
pub struct DuelDisputed {
    pub duel_id: [u8; 32],
}
