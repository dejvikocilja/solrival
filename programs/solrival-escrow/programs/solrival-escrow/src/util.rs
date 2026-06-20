use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::constants::VAULT_SEED;

/// Moves `amount` lamports out of the duel's vault PDA, signing with its seeds.
/// No-op for amount == 0. The vault is a system-owned, data-less PDA, so the
/// System Program can transfer from it under invoke_signed.
pub fn vault_signed_transfer<'info>(
    vault: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    duel_id: &[u8; 32],
    vault_bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[VAULT_SEED, duel_id.as_ref(), &[vault_bump]];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi = CpiContext::new_with_signer(
        system_program.clone(),
        Transfer { from: vault.clone(), to: to.clone() },
        signer,
    );
    transfer(cpi, amount)
}
