use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Duel is not in the expected state")]
    InvalidState,
    #[msg("Duel has not expired yet")]
    NotExpired,
    #[msg("Duel has already expired")]
    DuelExpired,
    #[msg("Winner must be the creator or challenger")]
    InvalidWinner,
    #[msg("Challenger cannot be the same as the creator")]
    SamePlayer,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Unauthorized authority")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Fee wallet does not match the escrow's recorded fee vault")]
    InvalidFeeVault,
}
