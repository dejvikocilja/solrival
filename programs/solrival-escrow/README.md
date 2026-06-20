# solrival-escrow

Per-duel SOL escrow with a constrained settlement authority. Anchor 0.30.1.

## Instructions
| ix | signer | effect |
|----|--------|--------|
| `initialize_config` | admin | create singleton Config (result_authority, fee_wallet, fee_bps ≤ 10%) |
| `update_config` | admin | rotate authority/fee wallet, change fee (capped), pause |
| `initialize_duel(duel_id, stake)` | creator | create escrow + vault, snapshot fee/authority, deposit creator stake, set 30-min expiry |
| `accept_duel` | opponent | deposit equal stake, status → Funded (rejects self-play / expired) |
| `settle_duel` | result_authority | pay winner (pot − fee) + fee_wallet, close escrow |
| `refund_duel` | result_authority | return both stakes (no fee), close escrow |
| `reclaim_expired` | creator | reclaim stake from an expired, never-accepted duel — no authority needed |

## Security invariants
- **Funds bind to a duel.** Vault PDA seeds = `[b"vault", duel_id]`; escrow seeds = `[b"escrow", duel_id]`.
- **Constrained authority.** `settle` can only pay an account equal to `creator` or `opponent`; the fee can only go to the snapshotted `fee_wallet`. A compromised `result_authority` cannot redirect funds to an arbitrary address or alter the stake — at worst it can pick the wrong participant or refund.
- **Idempotent / replay-safe.** `settle`/`refund`/`reclaim` close the escrow and drain the vault to zero. A replayed instruction fails because the accounts no longer exist. No status can be acted on twice.
- **No stranded funds.** Expired, unaccepted duels are reclaimable by the creator without any third party.
- **Snapshots.** `fee_bps`, `fee_wallet`, `result_authority` are copied into each escrow at creation, so later config changes never affect in-flight duels.
- **Safety rails.** Fee hard-capped at 10% (`MAX_FEE_BPS`); minimum stake (`MIN_STAKE_LAMPORTS`) keeps the lamport vault rent-safe; all money math is checked (overflow → error); vault sweeps guarantee a zero balance even under lamport-griefing.

## Off-chain binding
`duel_id` is the 16-byte duel UUID. The DB `duels.escrow_seed` / `escrow_pda` fields record the seed and derived address; `escrow_transactions` mirrors deposits/payouts by signature; the verifier's settlement signer is `result_authority`.

## Build / test
```bash
anchor keys sync     # replace the placeholder program id with your keypair's
anchor build
anchor test          # runs tests/solrival-escrow.ts against a local validator
anchor deploy --provider.cluster devnet
```
