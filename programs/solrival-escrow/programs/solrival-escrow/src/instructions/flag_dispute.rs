use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::EscrowError;
use crate::events::DuelDisputed;
use crate::state::{DuelEscrow, EscrowState};

/// Authority flags the duel as disputed when verification is inconclusive.
/// Funds remain locked in the vault until a future `resolve_dispute`
/// instruction (stub — not implemented in this version) handles resolution.
#[derive(Accounts)]
pub struct FlagDispute<'info> {
    /// Must match duel_escrow.result_authority.
    #[account(
        address = duel_escrow.result_authority @ EscrowError::Unauthorized
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.bump
    )]
    pub duel_escrow: Account<'info, DuelEscrow>,
}

pub fn handler(ctx: Context<FlagDispute>) -> Result<()> {
    let duel_escrow = &mut ctx.accounts.duel_escrow;

    require!(duel_escrow.state == EscrowState::Active, EscrowError::InvalidState);

    duel_escrow.state = EscrowState::Disputed;

    emit!(DuelDisputed { duel_id: duel_escrow.duel_id });
    Ok(())
}
