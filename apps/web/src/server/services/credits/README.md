# credits / custody (GGDUEL balance)

Custodial credits model: users deposit SOL **once** into a single platform
treasury, balances live in an append-only DB ledger, duels debit/credit those
balances with **no wallet popups**, and withdrawals send SOL back out. The
platform's only fee is the **deposit fee** — duels charge nothing, so the duel
winner receives the entire pot.

## Money model

Two buckets per user (`user_balances`): `available` (spendable now) and `locked`
(reserved by active duels + in-flight withdrawals). `available + locked` is the
user's claim on the treasury.

The **ledger is the source of truth**; the balance row is a fast cache. Every
balance mutation is one `ledger_entries` row written in the *same transaction*,
carrying signed `delta_available` / `delta_locked` and the post-state snapshot.
Reconcile any time by replaying: `SUM(delta_available)` per user must equal
`available_lamports`.

Safety properties (see `balance.ts`):

- **No overdraft / no double-apply.** Every mutation takes `SELECT … FOR UPDATE`
  on the user's row; concurrent debits serialize. SQL CHECK constraints pin both
  buckets `>= 0`.
- **Exactly-once.** `ledger_entries.idempotency_key` is unique and re-checked
  under the row lock, so retries (or duplicate webhooks/clicks) are no-ops.
- **Deadlock-free multi-user ops.** Duel settlement locks both players via
  `lockBalances` in sorted order before applying entries.

## Flows

**Deposit** (`deposit/service.ts`, `deposit/onchain.ts`)
User sends SOL to `NEXT_PUBLIC_TREASURY_WALLET`, then POSTs the signature to
`/api/deposits`. The server verifies on-chain (finalized, treasury balance
increased, sender = the user's login wallet), takes `DEPOSIT_FEE_BPS`, and
credits the net. Idempotent on the tx signature, so a transfer can't be credited
twice. The referee's **first** credited deposit triggers the referral reward
atomically.

**Duel** (`duel/credit-duel.ts`)
Create/accept **lock** each player's stake (`available → locked`) — instant, no
signature. On settle, the loser forfeits their locked stake and the winner
receives the full pot (`2 × stake`); on refund both locks return to available.
All atomic and idempotent. New duels default to `fundingMode = CREDITS`; the
legacy on-chain escrow path is preserved for `ONCHAIN_ESCROW` duels.

**Withdrawal** (`withdrawal/service.ts`) — fraud control
On request, funds are **locked immediately** (`available → locked`). Then:

- **No active dispute** → `APPROVED` automatically → treasury payout worker
  sends SOL → `COMPLETED` (lock settled out).
- **Active dispute** (open/under-review dispute, or a duel of theirs in
  `DISPUTED`) → `PENDING_REVIEW` → an admin approves or rejects from the
  dashboard (`/api/admin/withdrawals`). Reject reverts the lock to available.

SOL only ever leaves the treasury on `COMPLETED`. `REJECTED` / `FAILED` revert
the lock, so funds are never stranded. The payout worker
(`/api/internal/withdrawals/process`, shared-secret protected) is the only place
that uses `TREASURY_SECRET_KEY`.

## Wiring the verifier (one integration point)

The verifier currently settles duels on-chain. For credit duels it should branch
on `duel.fundingMode === "CREDITS"` and call `settleCreditDuel(duelId, winnerId)`
or `refundCreditDuel(duelId)` instead of building on-chain settle/refund
instructions. Those functions are DB-only, atomic, and idempotent.

## Config / env

`NEXT_PUBLIC_TREASURY_WALLET` (deposit address), `TREASURY_SECRET_KEY` (payout
signer — worker only), `NEXT_PUBLIC_DEPOSIT_FEE_BPS` (default 200 = 2%),
`NEXT_PUBLIC_REFERRAL_REWARD_BPS` (default 500 = 5%). See `apps/web/.env.example`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/balance` | balance + recent ledger |
| GET/POST | `/api/deposits` | deposit config + history / confirm a deposit |
| GET/POST | `/api/withdrawals` | history / request a withdrawal |
| GET  | `/api/admin/withdrawals` | review queue (admin) |
| GET/POST | `/api/admin/withdrawals/:id` | detail / approve-reject (admin) |
| POST | `/api/internal/withdrawals/process` | treasury payout worker (cron secret) |
