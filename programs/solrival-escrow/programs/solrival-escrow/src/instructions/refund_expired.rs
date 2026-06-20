use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::EscrowError;
use crate::events::EscrowRefunded;
use crate::state::{DuelEscrow, EscrowState};
use crate::util::vault_signed_transfer;

/// Permissionless refund once the duel has expired.
///
/// - `Created` state: only creator deposited; refund creator only.
/// - `Active` state: both deposited; refund each player their exact stake,
///   then sweep any remainder to creator.
///
/// ANY caller may trigger this (e.g. an automated keeper), but funds can only
/// flow to the two recorded participants, so a caller cannot redirect them.
#[derive(Accounts)]
pub struct RefundExpired<'info> {
    /// Any signer may trigger the refund (pays tx fee).
    pub caller: Signer<'info>,

    // M-007: has_one = creator validates the creator account matches the value
    // recorded at escrow creation before the close = creator transfer executes.
    #[account(
        mut,
        seeds = [ESCROW_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.bump,
        close = creator,
        has_one = creator @ EscrowError::Unauthorized,
    )]
    pub duel_escrow: Account<'info, DuelEscrow>,

    #[account(
        mut,
        seeds = [VAULT_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.vault_bump
    )]
    pub escrow_vault: SystemAccount<'info>,

    /// CHECK: key verified via has_one = creator on duel_escrow; receives refund + rent on close.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: must equal escrow.challenger when state is Active; validated in handler.
    #[account(mut)]
    pub challenger: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RefundExpired>) -> Result<()> {
    let duel_escrow = &ctx.accounts.duel_escrow;

    require!(
        duel_escrow.state == EscrowState::Created || duel_escrow.state == EscrowState::Active,
        EscrowError::InvalidState
    );

    let now = Clock::get()?.unix_timestamp;
    require!(now > duel_escrow.expires_at, EscrowError::NotExpired);

    let duel_id = duel_escrow.duel_id;
    let vault_bump = duel_escrow.vault_bump;
    let stake = duel_escrow.stake_lamports;
    let is_active = duel_escrow.state == EscrowState::Active;

    let vault_ai = ctx.accounts.escrow_vault.to_account_info();
    let sys_ai = ctx.accounts.system_program.to_account_info();

    if is_active {
        // Both players staked — refund challenger their exact stake first,
        // then sweep the vault remainder to creator.
        require_keys_eq!(
            ctx.accounts.challenger.key(),
            duel_escrow.challenger,
            EscrowError::InvalidWinner
        );

        vault_signed_transfer(
            &vault_ai,
            &ctx.accounts.challenger.to_account_info(),
            &sys_ai,
            &duel_id,
            vault_bump,
            stake,
        )?;
    }

    // Drain whatever remains to the creator (their stake + any stray lamports).
    let creator_amount = vault_ai.lamports();
    vault_signed_transfer(
        &vault_ai,
        &ctx.accounts.creator.to_account_info(),
        &sys_ai,
        &duel_id,
        vault_bump,
        creator_amount,
    )?;

    ctx.accounts.duel_escrow.state = EscrowState::Refunded;

    emit!(EscrowRefunded {
        duel_id,
        reason: if is_active { 1 } else { 0 },
    });
    Ok(())
}
