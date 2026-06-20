use anchor_lang::prelude::*;

/// PDA seeds.
#[constant]
pub const ESCROW_SEED: &[u8] = b"duel_escrow";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Basis-points denominator (100% = 10_000).
pub const BPS_DENOMINATOR: u64 = 10_000;
