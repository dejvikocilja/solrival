use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::constants::*;
use crate::errors::EscrowError;
use crate::events::DuelEscrowCreated;
use crate::state::{DuelEscrow, EscrowState};

#[derive(Accounts)]
#[instruction(duel_id: [u8; 32])]
pub struct CreateDuelEscrow<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + DuelEscrow::INIT_SPACE,
        seeds = [ESCROW_SEED, duel_id.as_ref()],
        bump
    )]
    pub duel_escrow: Account<'info, DuelEscrow>,

    /// Lamport-only vault PDA — system-owned, receives staked SOL.
    #[account(mut, seeds = [VAULT_SEED, duel_id.as_ref()], bump)]
    pub escrow_vault: SystemAccount<'info>,

    /// CHECK: stored in escrow; not validated here beyond being a writable account.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateDuelEscrow>,
    duel_id: [u8; 32],
    stake_lamports: u64,
    fee_bps: u16,
    expiry_seconds: i64,
    result_authority: Pubkey,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let expires_at = now
        .checked_add(expiry_seconds)
        .ok_or(EscrowError::ArithmeticOverflow)?;

    let duel_escrow = &mut ctx.accounts.duel_escrow;
    duel_escrow.duel_id = duel_id;
    duel_escrow.creator = ctx.accounts.creator.key();
    duel_escrow.challenger = Pubkey::default();
    duel_escrow.stake_lamports = stake_lamports;
    duel_escrow.fee_bps = fee_bps;
    duel_escrow.fee_vault = ctx.accounts.fee_vault.key();
    duel_escrow.result_authority = result_authority;
    duel_escrow.state = EscrowState::Created;
    duel_escrow.accepted_at = 0;
    duel_escrow.expires_at = expires_at;
    duel_escrow.bump = ctx.bumps.duel_escrow;
    duel_escrow.vault_bump = ctx.bumps.escrow_vault;

    // Creator deposits their stake into the vault immediately.
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
            },
        ),
        stake_lamports,
    )?;

    emit!(DuelEscrowCreated {
        duel_id,
        duel_escrow: duel_escrow.key(),
        creator: duel_escrow.creator,
        stake_lamports,
        fee_bps,
        expires_at,
    });
    Ok(())
}
