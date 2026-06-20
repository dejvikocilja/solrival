use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::{DuelEscrow, EscrowState};
use crate::util::vault_signed_transfer;

/// Resolves a disputed duel by paying out the winner or refunding both players.
///
/// Authority is constrained to `duel_escrow.result_authority` — only the
/// platform can call this instruction.  The duel must be in `Disputed` state.
/// On success the escrow account is closed and rent is returned to the creator.
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    /// Must match duel_escrow.result_authority.
    #[account(address = duel_escrow.result_authority @ EscrowError::Unauthorized)]
    pub authority: Signer<'info>,

    // M-007: has_one constraints validate all three related accounts against the
    // values snapshotted in the escrow at creation time.
    #[account(
        mut,
        seeds = [ESCROW_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.bump,
        close = creator,
        has_one = fee_vault  @ EscrowError::InvalidFeeVault,
        has_one = creator    @ EscrowError::Unauthorized,
        has_one = challenger @ EscrowError::Unauthorized,
    )]
    pub duel_escrow: Account<'info, DuelEscrow>,

    #[account(
        mut,
        seeds = [VAULT_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.vault_bump
    )]
    pub escrow_vault: SystemAccount<'info>,

    /// CHECK: validated in handler — must be the creator or challenger.
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: key verified via has_one = fee_vault on duel_escrow.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,

    /// CHECK: key verified via has_one = creator on duel_escrow; receives rent on close.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: key verified via has_one = challenger on duel_escrow; needed for refund-both path.
    #[account(mut)]
    pub challenger: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Resolution options passed by the platform authority.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ResolveDisputeResolution {
    /// Creator is declared the winner and receives the pot minus fee.
    WinnerIsCreator,
    /// Challenger is declared the winner and receives the pot minus fee.
    WinnerIsChallenger,
    /// Both players are refunded their original stake; no fee is charged.
    RefundBoth,
}

pub fn handler(ctx: Context<ResolveDispute>, resolution: ResolveDisputeResolution) -> Result<()> {
    let duel_escrow = &ctx.accounts.duel_escrow;

    require!(duel_escrow.state == EscrowState::Disputed, EscrowError::InvalidState);

    let duel_id    = duel_escrow.duel_id;
    let vault_bump = duel_escrow.vault_bump;
    let stake      = duel_escrow.stake_lamports;

    let vault_ai  = ctx.accounts.escrow_vault.to_account_info();
    let sys_ai    = ctx.accounts.system_program.to_account_info();
    let fee_ai    = ctx.accounts.fee_vault.to_account_info();
    let creator_ai    = ctx.accounts.creator.to_account_info();
    let challenger_ai = ctx.accounts.challenger.to_account_info();
    let winner_ai = ctx.accounts.winner.to_account_info();

    match resolution {
        ResolveDisputeResolution::WinnerIsCreator |
        ResolveDisputeResolution::WinnerIsChallenger => {
            // Validate the winner account matches the declared resolution.
            let expected_winner = if resolution == ResolveDisputeResolution::WinnerIsCreator {
                duel_escrow.creator
            } else {
                duel_escrow.challenger
            };
            require!(
                winner_ai.key() == expected_winner,
                EscrowError::InvalidWinner
            );

            // Calculate fee on the full pot.
            let total = stake
                .checked_mul(2)
                .ok_or(EscrowError::ArithmeticOverflow)?;
            let fee = total
                .checked_mul(duel_escrow.fee_bps as u64)
                .ok_or(EscrowError::ArithmeticOverflow)?
                .checked_div(BPS_DENOMINATOR)
                .ok_or(EscrowError::ArithmeticOverflow)?;

            // Fee first, then sweep remaining vault balance to winner.
            vault_signed_transfer(&vault_ai, &fee_ai, &sys_ai, &duel_id, vault_bump, fee)?;
            let payout = vault_ai.lamports();
            vault_signed_transfer(&vault_ai, &winner_ai, &sys_ai, &duel_id, vault_bump, payout)?;
        }

        ResolveDisputeResolution::RefundBoth => {
            // Refund each player their original stake; no fee charged.
            vault_signed_transfer(&vault_ai, &creator_ai,    &sys_ai, &duel_id, vault_bump, stake)?;
            vault_signed_transfer(&vault_ai, &challenger_ai, &sys_ai, &duel_id, vault_bump, stake)?;
        }
    }

    // Escrow account is closed via `close = creator` constraint — rent returned automatically.
    ctx.accounts.duel_escrow.state = EscrowState::Finalized;
    Ok(())
}
