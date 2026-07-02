# SolRival — Cloud Setup, Testing & Deployment

This guide gets SolRival running, tested, and deployed **entirely in the cloud** — you never compile, run a database, or host anything on your own machine. Your laptop is just a browser.

The platform is three moving parts plus a database, and they don't all go to the same place:

| Component | What it is | Where it runs | Why |
|---|---|---|---|
| **Web** (`apps/web`) | Next.js app + API routes | Vercel **or** a container host | Public site + JSON API |
| **Verification + payout sweeps** (in `apps/web`) | Battle-log polling + treasury payouts, driven by a scheduler hitting `/api/internal/*` | Always-on host with a **static outbound IP** | Supercell tokens are IP-whitelisted, so the sweeps must run from a fixed egress IP — this part cannot be serverless |
| **Database** | Postgres 15 | Supabase (managed) | Single source of truth; balances + ledger |
| **Solana** | RPC endpoint | Helius (or any RPC) | Read deposits, send withdrawals |

The single most important architectural rule (from `docs/ADR-0001`): **anything that calls the Supercell API needs a fixed egress IP, because the API tokens are IP-whitelisted.** Verification (reading battle logs) is what calls Supercell.

Two deployment shapes satisfy this:

- **All-in-one (recommended, simplest).** Run the Next.js app as a single container on a host with a static outbound IP (Railway / Render / Fly.io). The verification + payout sweeps run there too (a scheduler hits the `/api/internal/*` endpoints), so the Supercell calls come from the whitelisted IP. No separate service to operate. This is the current shape — verification lives entirely in `apps/web`.
- **Scale-out.** Web on Vercel (serverless) + a separate always-on worker on a static-egress host that runs the verification + payout sweeps. There is no standalone worker package today; if you reach this scale, factor the sweep code (`runVerificationSweep` / `processApprovedWithdrawals`) into a small dedicated service. Use this only once traffic justifies splitting them.

Either way the verification work is the same code (`runVerificationSweep`), driven by a scheduler hitting an endpoint — never an in-process timer.

---

## Part 1 — Develop & test in the cloud (no local CPU)

You'll do all building and testing inside a **GitHub Codespace** — a full Linux dev box in your browser. (Gitpod works identically if you prefer.)

GitHub's free individual plan includes ~60 hours/month of a 2-core Codespace, which is plenty for setup and testing. ([Codespaces pricing](https://github.com/features/codespaces))

### 1.1 Open a Codespace
1. Push this repo to GitHub (or fork it).
2. On the repo page: **Code → Codespaces → Create codespace on main**.
3. Wait for it to boot. You now have a terminal + VS Code in the browser. Everything below runs **in that terminal**, not on your PC.

```bash
corepack enable && corepack prepare pnpm@latest --activate
pnpm install
```

### 1.2 A free test database (Supabase)
1. Create a free Supabase project at supabase.com. The free tier gives 500 MB Postgres, which is ample for testing. Note: free projects **pause after ~1 week idle** — just un-pause it. ([Supabase pricing](https://supabase.com/pricing))
2. From **Project Settings → Database**, copy the two connection strings into a `.env` in the Codespace (see the env checklist in Part 3). Use the **pooler** URL for `DATABASE_URL` and the **direct** URL for `DIRECT_URL`.

### 1.3 Apply the schema (including the credits tables)
The credits migration needs the raw-SQL constraints folded in (Prisma can't express CHECK/partial indexes). From `packages/db`:

```bash
pnpm --filter @solrival/db migrate:dev -- --name credits --create-only
cat packages/db/prisma/sql/0001_constraints_and_partial_indexes.sql \
    packages/db/prisma/sql/0002_credits_constraints.sql \
  >> packages/db/prisma/migrations/*_credits/migration.sql
pnpm --filter @solrival/db migrate:dev      # applies it
pnpm --filter @solrival/db seed             # seeds the 7 duel rule templates
pnpm --filter @solrival/db exec prisma generate
```

(See `packages/db/MIGRATION_NOTES.md` §8 for the full rationale.)

### 1.4 A devnet treasury + test SOL
Solana **devnet** is a free, fake-money clone of mainnet — perfect for testing real flows without spending anything. Install the CLI in the Codespace and make a treasury keypair:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # solana CLI
solana-keygen new --no-bip39-passphrase -o treasury.json
solana config set --url devnet
solana airdrop 5 $(solana-keygen pubkey treasury.json)          # fund the treasury for withdrawals
```

- `NEXT_PUBLIC_TREASURY_WALLET` = `solana-keygen pubkey treasury.json`
- `TREASURY_SECRET_KEY` = the **contents** of `treasury.json` (the `[1,2,3,…]` byte array)

You'll also fund your **personal** test wallet (Phantom set to devnet) with `solana airdrop 2 <your-wallet>` so you can make a deposit.

### 1.5 Run it and test end-to-end
```bash
pnpm --filter web typecheck    # full type-check (now that Prisma client is generated)
pnpm --filter web test         # unit tests
pnpm --filter web dev          # starts on :3000 — Codespaces forwards the port; click the popup
```

**First, run the automated smoke test** (in a second terminal, with the dev server up). It drives the *real* APIs end-to-end — SIWS auth for two ephemeral wallets, on-chain devnet deposits, duel create/accept with ledger-lock assertions, the verification sweep, and a withdrawal paid out by the treasury worker:

```bash
VERIFY_CRON_SECRET=$EXPIRE_CRON_SECRET \
WITHDRAWAL_CRON_SECRET=$WITHDRAWAL_CRON_SECRET \
pnpm --filter web smoke
```

Devnet airdrops are rate-limited; if funding fails, set `SMOKE_FUNDER_SECRET` to a pre-funded devnet key. The one thing the script can't do is play the in-game battle — the duel it leaves open auto-disputes at the verification timeout, which safely exercises that path too.

Then walk the happy path manually in the forwarded browser tab, with Phantom on **devnet**:

1. **Connect wallet** → sign in.
2. **Wallet → Deposit** a little SOL. One wallet popup; balance appears net of the 2% fee.
3. **Create a duel** — note there's *no* wallet popup now; the stake is locked from your balance.
4. From a second wallet, **accept** it (also no popup).
5. Play the match in-game, then trigger verification: `curl -X POST localhost:3000/api/internal/duels/verify -H "Authorization: Bearer $EXPIRE_CRON_SECRET"`. The sweep reads the battle log and settles — the winner's balance jumps by the full pot. (No real match? Resolve it from **Admin → Duels/Disputes** instead.)
6. **Wallet → Withdraw** → with no dispute it auto-approves; run the payout worker (Part 4) → SOL lands back in the wallet.
7. Open a dispute on a duel, then try to withdraw → it's held **PENDING_REVIEW**; approve it in **Admin → Withdrawals**.

> To reach the admin panel, add your wallet to `ADMIN_WALLET_ALLOWLIST` and sign in again.

---

## Part 2 — Choosing production hosts

| Need | Recommended | Notes |
|---|---|---|
| Database | **Supabase Pro** (~$25/mo) for production | Free tier auto-pauses + has no backups; fine for staging, not for real money. ([pricing](https://supabase.com/pricing)) |
| Web app | **Vercel Pro** (~$20/mo) **or** Railway/Render container | ⚠️ Vercel **Hobby is non-commercial only** — a paid gaming/escrow platform needs Pro. ([Hobby plan](https://vercel.com/docs/plans/hobby)) |
| Sweep host (static-egress) | **Fly.io** or **Railway** | Runs the verification + payout sweeps (all-in-one: this is the same `apps/web` container). Always-on, **static outbound IP** required. Fly.io assigns static IPv4/IPv6 by default (~$2/mo for a small machine); Railway is ~$5/mo + $2/mo for a dedicated IPv4. ([Railway/Render/Fly comparison](https://techsy.io/en/blog/railway-vs-render-vs-fly-io)) |
| Solana RPC | **Helius** | Free tier (1M credits/mo, 10 req/s) is fine for devnet + low traffic; paid for mainnet volume. ([Helius pricing](https://www.helius.dev/pricing)) |

A realistic minimum monthly cost for a live mainnet deployment is roughly **$45–60/mo** (Supabase Pro + Vercel Pro + a small static-egress VM for the sweeps), before RPC upgrades.

---

## Part 3 — Environment variables

Copy `apps/web/.env.example` and fill it in. The variables split across hosts like this:

**Web host (Vercel/Railway):** `DATABASE_URL`, `DIRECT_URL`, `AUTH_JWT_SECRET`, `SIWS_DOMAIN`, `ADMIN_WALLET_ALLOWLIST`, `INTERNAL_API_SECRET`, `EXPIRE_CRON_SECRET`, `NEXT_PUBLIC_*` (cluster, RPC URL, program id, **`NEXT_PUBLIC_TREASURY_WALLET`**, `NEXT_PUBLIC_DEPOSIT_FEE_BPS`, `NEXT_PUBLIC_REFERRAL_REWARD_BPS`, app URL).

**Static-egress sweep host (the all-in-one `apps/web` container, or a future dedicated worker):** also needs `CLASH_ROYALE_API_TOKEN`, `BRAWL_STARS_API_TOKEN` (both bound to this host's IP in the Supercell developer portal) and `VERIFICATION_POLL_INTERVAL_MS`, in addition to the web vars above. Optionally set `VERIFY_CRON_SECRET` to give the settlement-triggering verify sweep its own token (it falls back to `EXPIRE_CRON_SECRET` when unset).

> **No static IP? Use the RoyaleAPI proxy instead.** Create your Supercell keys whitelisting IP `45.79.218.79`, then set `CLASH_ROYALE_API_BASE_URL=https://proxy.royaleapi.dev/v1` and `BRAWL_STARS_API_BASE_URL=https://proxy.royaleapi.dev/v1` — the community proxy forwards to the official APIs for Clash Royale, Clash of Clans and Brawl Stars ([docs](https://docs.royaleapi.com/proxy.html)). This removes the static-egress requirement entirely (the sweep can then run anywhere, even Vercel Cron). Trade-off: your tokens and verification traffic route through RoyaleAPI's infrastructure — fine for launch; move to your own static-IP host if you outgrow it.

**Treasury secret — pick one home for `TREASURY_SECRET_KEY`:**
- **Simple:** put it on the **web host** and let a scheduler hit `POST /api/internal/withdrawals/process`. Treasury payouts are plain SOL transfers and don't need static egress, so this works on Vercel.
- **Hardened (recommended for mainnet):** keep `TREASURY_SECRET_KEY` only on the **static-egress sweep host** and run the payout sweep there, so the signing key never lives on the public web tier. Use the host's secret manager, never commit it.

Generate secrets with `openssl rand -hex 32` (for `AUTH_JWT_SECRET`, `INTERNAL_API_SECRET`, `EXPIRE_CRON_SECRET`).

---

## Part 4 — Background jobs (cron)

Three endpoints must be hit on a schedule (sent as `Authorization: Bearer <secret>`, compared in constant time). The two duel crons share `EXPIRE_CRON_SECRET`; the payout worker uses its **own** `WITHDRAWAL_CRON_SECRET` so a leak of the duel-cron token can't move funds:

| Endpoint | Secret | Cadence | Purpose |
|---|---|---|---|
| `POST /api/internal/duels/verify` | `VERIFY_CRON_SECRET` (falls back to `EXPIRE_CRON_SECRET`) | every 30–60 s | reads battle logs for live duels, settles winners, disputes timeouts (**runs from the static-egress host** — or anywhere, if using the RoyaleAPI proxy above) |
| `POST /api/internal/duels/expire` | `EXPIRE_CRON_SECRET` | every 1–2 min | sweeps expired open (never-accepted) duels |
| `POST /api/internal/withdrawals/process` | `WITHDRAWAL_CRON_SECRET` | every 1–2 min | pays out approved withdrawals from the treasury |

Schedule them with whatever your host offers — Railway/Render/Fly cron, a Vercel Cron Job, GitHub Actions on a schedule, or a free external pinger (cron-job.org). Example external call:

```bash
curl -X POST https://your-domain.com/api/internal/withdrawals/process \
  -H "Authorization: Bearer $WITHDRAWAL_CRON_SECRET"
```

---

## Part 5 — Deploy

A sensible order:

1. **Database first.** Create the Supabase (Pro) project, set its connection strings, and run the migration once (`migrate:deploy`, the production-safe apply) from a Codespace or CI.
2. **Web (and sweeps).** Deploy `apps/web`. For the recommended all-in-one shape, run it as a single container on Fly.io/Railway with a **static IP**, and register that IP for both Supercell API tokens — the verification sweep calls Supercell from there. (Scale-out alternative: web on Vercel Pro + a separate static-egress worker.) Set all web env vars and point `NEXT_PUBLIC_TREASURY_WALLET` at the **mainnet** treasury for production. Put the treasury key on the static-egress host if using the hardened layout.
3. **Cron.** Wire the three scheduled jobs (Part 4).
4. **Smoke test on devnet first**, then switch `NEXT_PUBLIC_SOLANA_CLUSTER` to `mainnet-beta`, swap in a mainnet RPC + a freshly-generated mainnet treasury key, and fund the treasury with real SOL only when you're ready.

### Going to mainnet — safety checklist
- New treasury keypair generated **on the host**, never on a shared machine; backed up offline.
- `TREASURY_SECRET_KEY` lives in a secret manager, not in code or `NEXT_PUBLIC_*`.
- Reconcile the ledger before opening up: `SUM(ledger_entries.delta_available)` per user must equal `user_balances.available_lamports`.
- Keep the treasury's hot balance modest; sweep excess to cold storage. Auto-approval still locks funds, but the manual-review path is your fraud backstop — make sure at least one admin wallet is on the allowlist.
- Confirm withdrawals settle (`COMPLETED`) and that rejected/failed ones revert the lock (watch the `WITHDRAWAL_REVERT` ledger entries).

---

## CI (optional but recommended)

`.github/workflows/ci.yml` already exists — run typecheck + tests on every push so you catch breaks in the cloud, not after deploy. Add a Supabase **branch/test** database URL as a repo secret for migration tests.

---

### Sources
- [Supabase pricing & free-tier limits](https://supabase.com/pricing)
- [Vercel Hobby plan (non-commercial restriction)](https://vercel.com/docs/plans/hobby)
- [Railway vs Render vs Fly.io 2026](https://techsy.io/en/blog/railway-vs-render-vs-fly-io)
- [Helius RPC pricing](https://www.helius.dev/pricing)
- [GitHub Codespaces](https://github.com/features/codespaces)
