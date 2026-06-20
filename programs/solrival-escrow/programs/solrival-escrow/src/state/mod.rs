use anchor_lang::prelude::*;

/// Per-duel escrow metadata. Funds live in a separate lamport-only vault PDA
/// (seeds = [VAULT_SEED, duel_id]) so payouts are plain signed system transfers
/// and rent accounting stays simple.
///
/// `result_authority` and `vault_bump` are added beyond the spec struct because
/// they are required for on-chain authority validation and PDA signing.
#[account]
#[derive(InitSpace)]
pub struct DuelEscrow {
    pub duel_id: [u8; 32],        // UTF-8 duel ID, zero-padded
    pub creator: Pubkey,
    pub challenger: Pubkey,       // Pubkey::default() until deposit_stake
    pub stake_lamports: u64,      // per-player stake
    pub fee_bps: u16,             // platform fee in basis points (e.g. 500 = 5%)
    pub fee_vault: Pubkey,        // platform fee collection wallet
    pub result_authority: Pubkey, // trusted signer for finalize_payout / flag_dispute
    pub state: EscrowState,
    pub accepted_at: i64,         // Unix timestamp, 0 until accepted
    pub expires_at: i64,          // Unix timestamp for refund eligibility
    pub bump: u8,
    pub vault_bump: u8,           // stored so vault PDA can be signed
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowState {
    Created,   // creator deposited, waiting for challenger
    Active,    // both deposited
    Finalized, // winner paid out
    Refunded,  // expired, both refunded
    Disputed,  // flagged for manual review
}
