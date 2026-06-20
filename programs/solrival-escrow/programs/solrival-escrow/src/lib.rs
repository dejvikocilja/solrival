//! SolRival Escrow Program
//!
//! Per-duel SOL escrow with a constrained settlement authority.
//!
//! # Trust model
//!
//! - Each duel's stake lives in a lamport-only vault PDA seeded by `duel_id`.
//! - `finalize_payout` and `flag_dispute` require the `result_authority`
//!   signature that was snapshotted into the escrow at creation. A compromised
//!   authority can only pick the wrong participant, never redirect funds.
//! - `refund_expired` is permissionless once `expires_at` has passed, so
//!   funds can never be stranded by an unresponsive authority.
//! - `Finalized` / `Refunded` both close the escrow account, so replay attacks
//!   fail because the account no longer exists.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;
pub mod util;
pub mod instructions;

use instructions::*;

// L-007: dedicated program id. The matching signing keypair lives at
// programs/solrival-escrow/solrival-program.keypair.json (gitignored) — deploy
// with it via `anchor deploy --program-keypair <that file>` so the on-chain id
// matches. Run `anchor keys sync` after `anchor build` to keep this and the
// TypeScript client in sync if you ever rotate it.
declare_id!("HA38xW46mB8J6ZNdL3NAjRbJamDMGLoo4Eq6bJdU7W23");

#[program]
pub mod solrival_escrow {
    use super::*;

    /// Creator initialises a new duel and deposits their stake.
    pub fn create_duel_escrow(
        ctx: Context<CreateDuelEscrow>,
        duel_id: [u8; 32],
        stake_lamports: u64,
        fee_bps: u16,
        expiry_seconds: i64,
        result_authority: Pubkey,
    ) -> Result<()> {
        instructions::create_duel_escrow::handler(
            ctx,
            duel_id,
            stake_lamports,
            fee_bps,
            expiry_seconds,
            result_authority,
        )
    }

    /// Challenger deposits matching stake; duel becomes `Active`.
    pub fn deposit_stake(ctx: Context<DepositStake>) -> Result<()> {
        instructions::deposit_stake::handler(ctx)
    }

    /// Platform authority finalises the duel and pays the winner.
    pub fn finalize_payout(ctx: Context<FinalizePayout>, winner: Pubkey) -> Result<()> {
        instructions::finalize_payout::handler(ctx, winner)
    }

    /// Permissionless refund once `expires_at` has passed.
    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        instructions::refund_expired::handler(ctx)
    }

    /// Authority flags an `Active` duel as disputed; funds stay locked.
    pub fn flag_dispute(ctx: Context<FlagDispute>) -> Result<()> {
        instructions::flag_dispute::handler(ctx)
    }

    /// Authority resolves a `Disputed` duel — pays out the winner or refunds both.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolution: ResolveDisputeResolution,
    ) -> Result<()> {
        instructions::resolve_dispute::handler(ctx, resolution)
    }
}
