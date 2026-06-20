use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::EscrowError;
use crate::events::PayoutFinalized;
use crate::state::{DuelEscrow, EscrowState};
use crate::util::vault_signed_transfer;

/// Pays out the winner after the platform verification engine has determined
/// the result. The authority is constrained to the value snapshotted at duel
/// creation — a compromised authority can only pick the wrong participant, not
/// redirect funds to an arbitrary address.
#[derive(Accounts)]
pub struct FinalizePayout<'info> {
    /// Must match duel_escrow.result_authority.
    #[account(
        address = duel_escrow.result_authority @ EscrowError::Unauthorized
    )]
    pub authority: Signer<'info>,

    // M-007: has_one constraints ensure fee_vault and creator passed by the
    // caller actually match what was snapshotted in the escrow at creation.
    #[account(
        mut,
        seeds = [ESCROW_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.bump,
        close = creator,
        has_one = fee_vault @ EscrowError::InvalidFeeVault,
        has_one = creator  @ EscrowError::Unauthorized,
    )]
    pub duel_escrow: Account<'info, DuelEscrow>,

    #[account(
        mut,
        seeds = [VAULT_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.vault_bump
    )]
    pub escrow_vault: SystemAccount<'info>,

    /// CHECK: validated in handler to be creator or challenger.
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: key verified via has_one = fee_vault on duel_escrow.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,

    /// CHECK: key verified via has_one = creator on duel_escrow; receives rent on close.
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FinalizePayout>, winner: Pubkey) -> Result<()> {
    let duel_escrow = &ctx.accounts.duel_escrow;

    require!(duel_escrow.state == EscrowState::Active, EscrowError::InvalidState);
    require!(
        winner == duel_escrow.creator || winner == duel_escrow.challenger,
        EscrowError::InvalidWinner
    );
    require_keys_eq!(
        ctx.accounts.winner.key(),
        winner,
        EscrowError::InvalidWinner
    );

    let duel_id = duel_escrow.duel_id;
    let vault_bump = duel_escrow.vault_bump;
    let stake = duel_escrow.stake_lamports;
    let fee_bps = duel_escrow.fee_bps as u64;

    let total = stake.checked_mul(2).ok_or(EscrowError::ArithmeticOverflow)?;
    let fee = total
        .checked_mul(fee_bps)
        .ok_or(EscrowError::ArithmeticOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(EscrowError::ArithmeticOverflow)?;

    let vault_ai = ctx.accounts.escrow_vault.to_account_info();
    let sys_ai = ctx.accounts.system_program.to_account_info();

    // Transfer fee first, then sweep the remaining vault balance to the winner.
    // Sweeping guarantees the vault drains to zero even with stray lamports.
    vault_signed_transfer(
        &vault_ai,
        &ctx.accounts.fee_vault.to_account_info(),
        &sys_ai,
        &duel_id,
        vault_bump,
        fee,
    )?;

    let payout = vault_ai.lamports();
    require!(payout > 0, EscrowError::InsufficientVaultBalance);

    vault_signed_transfer(
        &vault_ai,
        &ctx.accounts.winner.to_account_info(),
        &sys_ai,
        &duel_id,
        vault_bump,
        payout,
    )?;

    ctx.accounts.duel_escrow.state = EscrowState::Finalized;

    emit!(PayoutFinalized {
        duel_id,
        winner,
        payout_lamports: payout,
        fee_lamports: fee,
    });
    Ok(())
}
