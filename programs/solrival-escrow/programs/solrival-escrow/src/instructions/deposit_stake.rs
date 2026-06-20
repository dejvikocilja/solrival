use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::constants::*;
use crate::errors::EscrowError;
use crate::events::StakeDeposited;
use crate::state::{DuelEscrow, EscrowState};

#[derive(Accounts)]
pub struct DepositStake<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,

    #[account(
        mut,
        seeds = [ESCROW_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.bump
    )]
    pub duel_escrow: Account<'info, DuelEscrow>,

    #[account(
        mut,
        seeds = [VAULT_SEED, duel_escrow.duel_id.as_ref()],
        bump = duel_escrow.vault_bump
    )]
    pub escrow_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositStake>) -> Result<()> {
    let duel_escrow = &mut ctx.accounts.duel_escrow;

    require!(duel_escrow.state == EscrowState::Created, EscrowError::InvalidState);
    require_keys_neq!(
        ctx.accounts.challenger.key(),
        duel_escrow.creator,
        EscrowError::SamePlayer
    );

    // Reject if the duel window has already closed.
    let now = Clock::get()?.unix_timestamp;
    require!(now <= duel_escrow.expires_at, EscrowError::DuelExpired);

    let stake = duel_escrow.stake_lamports;
    duel_escrow.challenger = ctx.accounts.challenger.key();
    duel_escrow.state = EscrowState::Active;
    duel_escrow.accepted_at = now;

    // Challenger deposits matching stake.
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.challenger.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
            },
        ),
        stake,
    )?;

    emit!(StakeDeposited {
        duel_id: duel_escrow.duel_id,
        challenger: ctx.accounts.challenger.key(),
        accepted_at: now,
    });
    Ok(())
}
