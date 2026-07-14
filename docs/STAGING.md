# SolRival — Staging Deployment (Phase 2)

Staging is a **complete, real deployment** — real host, real database, real crons — but still on **Solana devnet**, so the SOL is worthless and mistakes cost nothing. It is the dress rehearsal for mainnet, and the gate that must pass before it.

Nothing here touches your local Codespace database or your `.env.local`. Staging is a separate world with **its own secrets and its own treasury wallet**.

**Why Vercel works now:** the Supercell tokens are IP-whitelisted to the *RoyaleAPI proxy* (`45.79.218.79`), not to your server — so requests can originate from anywhere. That removes the old static-egress requirement and lets the app and its crons run serverless.

---

## What you'll end up with

| Piece | Where | Cost |
|---|---|---|
| Web app + API + crons | Vercel (**Pro plan required** — see note) | $20/mo |
| Database | Supabase — a **second, separate project** | Free tier is fine for staging |
| Solana | devnet RPC | free |
| Rate limiting | Upstash Redis | free tier |
| Error tracking | Sentry | free tier |

> **Vercel plan note.** Vercel's Hobby plan only runs cron jobs **once per day** — useless for a verification sweep that must run every minute. Staging needs the **Pro** plan for per-minute crons. (Alternative if you'd rather not pay yet: skip `vercel.json` and drive the same three endpoints from a free external scheduler like cron-job.org, which can hit them every minute. The endpoints accept both GET and POST.)

---

## Step 1 — Create the staging database

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it **`solrival-staging`**. Region: **eu-west-1 (Ireland)** — same as your dev project.
3. Set a strong database password and **save it in your password manager immediately**.
4. Wait for it to finish provisioning (~2 minutes).
5. Go to **Project Settings → Database → Connection string** and copy **two** URLs:
   - the **Transaction pooler** one (port `6543`) → this is `DATABASE_URL`
   - the **Session pooler** one (port `5432`) → this is `DIRECT_URL`

> Use the *pooler* URLs, not `db.<ref>.supabase.co`. That direct host is IPv6-only and unreachable from most build environments — it's exactly what broke your migration earlier.

---

## Step 2 — Generate fresh staging secrets

**Never reuse your development secrets or your development treasury key.** Run this in your Codespace terminal — it prints everything you need:

```bash
cd /workspaces/solrival
node -e '
const { randomBytes } = require("crypto");
const { Keypair } = require("@solana/web3.js");
const kp = Keypair.generate();
const s = () => randomBytes(32).toString("hex");
console.log("AUTH_JWT_SECRET=" + s());
console.log("INTERNAL_API_SECRET=" + s());
console.log("EXPIRE_CRON_SECRET=" + s());
console.log("VERIFY_CRON_SECRET=" + s());
console.log("WITHDRAWAL_CRON_SECRET=" + s());
console.log("CRON_SECRET=" + s());
console.log("NEXT_PUBLIC_TREASURY_WALLET=" + kp.publicKey.toBase58());
console.log("TREASURY_SECRET_KEY=" + JSON.stringify(Array.from(kp.secretKey)));
'
```

Copy the whole output into your password manager under "SolRival staging". You'll paste these into Vercel in Step 4.

Note `VERIFY_CRON_SECRET` is now its own secret (it triggers settlements — money moves), and `CRON_SECRET` is the one **Vercel itself** uses to authenticate its scheduler.

---

## Step 3 — Fund the staging treasury

Go to <https://faucet.solana.com>, paste the `NEXT_PUBLIC_TREASURY_WALLET` address from Step 2, and request devnet SOL (do it twice — you want a few SOL for payouts).

---

## Step 4 — Deploy to Vercel

1. Go to <https://vercel.com/new> and import the `dejvikocilja/solrival` repository.
2. **Root Directory**: click *Edit* and set it to **`apps/web`**. (Critical — this is a monorepo.)
3. Framework preset: **Next.js** (auto-detected). Leave build commands alone.
4. Before clicking Deploy, open **Environment Variables** and add every row below.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL (port 6543), from Step 1 |
| `DIRECT_URL` | Supabase session pooler URL (port 5432), from Step 1 |
| `AUTH_JWT_SECRET` | from Step 2 |
| `INTERNAL_API_SECRET` | from Step 2 |
| `EXPIRE_CRON_SECRET` | from Step 2 |
| `VERIFY_CRON_SECRET` | from Step 2 |
| `WITHDRAWAL_CRON_SECRET` | from Step 2 |
| `CRON_SECRET` | from Step 2 (Vercel's scheduler uses this) |
| `TREASURY_SECRET_KEY` | from Step 2 (the `[1,2,3,…]` array) |
| `NEXT_PUBLIC_TREASURY_WALLET` | from Step 2 |
| `CLASH_ROYALE_API_TOKEN` | same token as dev |
| `CLASH_ROYALE_API_BASE_URL` | `https://proxy.royaleapi.dev/v1` |
| `BRAWL_STARS_API_TOKEN` | same token as dev |
| `BRAWL_STARS_API_BASE_URL` | `https://bsproxy.royaleapi.dev/v1` |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_SOLRIVAL_PROGRAM_ID` | same value as your `apps/web/.env.local` (required at boot — the app refuses to start without it) |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-PROJECT.vercel.app` (fill in after the first deploy, then redeploy) |
| `SIWS_DOMAIN` | `YOUR-PROJECT.vercel.app` (no `https://`) |
| `ADMIN_WALLET_ALLOWLIST` | your Phantom wallet address |
| `NEXT_PUBLIC_DEPOSIT_FEE_BPS` | `50` |
| `NEXT_PUBLIC_REFERRAL_REWARD_BPS` | `500` |
| `VERIFICATION_POLL_INTERVAL_MS` | `15000` |
| `NEXT_PUBLIC_WITHDRAWAL_FEE_BPS` | `50` |
| `NEXT_PUBLIC_DUEL_RAKE_BPS` | `500` |
| `LAUNCH_MAX_STAKE_SOL` | `5` |
| `LAUNCH_MAX_WITHDRAWAL_SOL_PER_DAY` | `50` |
| `DISPUTE_WINDOW_HOURS` | `48` |
| `DUEL_VALIDITY_WINDOW_MIN` | `30` |

Do **not** set `NODE_ENV` — Vercel sets it to `production` automatically, which is what gates the `/design` styleguide and turns on fail-fast env validation.

5. Click **Deploy**. The build runs `prisma generate` automatically (via the `postinstall` hook in `packages/db`).

> **Note on `vercel.json`.** It deliberately contains **no `crons` block**. Vercel's Hobby (free) plan rejects any cron expression that fires more than once per day — the deployment itself would fail. Scheduling is configured in Step 7 instead, and works on the free plan.

---

## Step 5 — Create the database tables

The deploy does **not** run migrations (deliberately — concurrent builds must never race on schema changes). Run them once, from your Codespace, pointed at staging:

```bash
cd /workspaces/solrival
DATABASE_URL="<staging transaction pooler URL>" \
DIRECT_URL="<staging session pooler URL>" \
pnpm --filter @solrival/db exec prisma migrate deploy
```

Expect: `3 migrations found` … `All migrations have been successfully applied.`

Then seed the duel rules (without these, no duel can be created):

```bash
DATABASE_URL="<staging transaction pooler URL>" \
DIRECT_URL="<staging session pooler URL>" \
pnpm --filter @solrival/db exec tsx prisma/seed.ts
```

---

## Step 6 — THE GATE: run the smoke test against staging

This is the go/no-go. It exercises the full economic engine — auth, deposit, duel create/accept, verification sweep, withdrawal, real SOL out — against the deployed staging app.

```bash
cd /workspaces/solrival
APP_URL="https://YOUR-PROJECT.vercel.app" \
TREASURY_SECRET_KEY='<staging treasury secret array>' \
NEXT_PUBLIC_SOLANA_CLUSTER=devnet \
NEXT_PUBLIC_SOLANA_RPC_URL="https://api.devnet.solana.com" \
pnpm --filter web smoke
```

**Every step must print PASS.** If any step fails, staging is not ready — fix it before going further. (The script refuses to run against mainnet, by design.)

---

## Step 7 — Set up the schedulers

Three sweeps must run continuously. **Nothing works without them**: duels never verify, nothing expires, withdrawals never pay out.

| Endpoint | How often | Secret to use | Why |
|---|---|---|---|
| `/api/internal/duels/verify` | every **1 min** | `VERIFY_CRON_SECRET` | settles duels — moves money |
| `/api/internal/withdrawals/process` | every **2 min** | `WITHDRAWAL_CRON_SECRET` | pays out withdrawals |
| `/api/internal/duels/expire` | every **5 min** | `EXPIRE_CRON_SECRET` | expires unaccepted duels |

All three accept **GET** (what schedulers send) and **POST**, authorised by `Authorization: Bearer <secret>`.

### Option A — free external scheduler (recommended for staging)

Vercel's free plan can only run a cron **once per day**, which is useless here. An external scheduler calls the same URLs on any cadence, at no cost, and adds retries and failure alerts that Vercel's cron doesn't have.

1. Sign up at <https://cron-job.org> (free).
2. Create **three** jobs. For each one:
   - **URL**: `https://YOUR-PROJECT.vercel.app` + the endpoint path from the table
   - **Schedule**: every 1 / 2 / 5 minutes per the table
   - **Advanced → Headers**: add `Authorization` with value `Bearer <the matching secret from Step 2>`
   - Method: GET
3. Save and enable each job.

### Option B — Vercel Cron (requires Pro, $20/mo)

Add this block to `apps/web/vercel.json` and redeploy. Vercel authenticates itself using the `CRON_SECRET` env var you already set.

```json
  "crons": [
    { "path": "/api/internal/duels/verify",         "schedule": "* * * * *" },
    { "path": "/api/internal/withdrawals/process",  "schedule": "*/2 * * * *" },
    { "path": "/api/internal/duels/expire",         "schedule": "*/5 * * * *" }
  ]
```

### Confirm they work

Call one by hand first:

```bash
curl -s "https://YOUR-PROJECT.vercel.app/api/internal/duels/verify" \
  -H "Authorization: Bearer <VERIFY_CRON_SECRET>"
```

Expect `{"checked":0,"verified":0,...}`. A `401` means the secret doesn't match; a `405` means the route isn't accepting GET (it should — both are supported).

Then, in Vercel → **Logs**, filter for `/api/internal/` and confirm you see repeating `200`s at the right cadence.

---

## Step 8 — Add rate limiting and error tracking

**Upstash (rate limiting).** Create a free Redis database at <https://console.upstash.com>, then add to Vercel env:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Without these the app falls back to in-memory rate limiting, which doesn't work across serverless instances — each one gets its own counter.

**Sentry (errors).** Create a free project at <https://sentry.io> (platform: Next.js), copy the DSN, then add to Vercel env:
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN` (same value)
- `SENTRY_ENVIRONMENT` = `staging`

Redeploy after adding either set.

---

## Step 9 — Manual QA pass on staging

Do these in a browser against the staging URL, with two different wallets:

- [ ] Sign in with a wallet (SIWS)
- [ ] Link a game account in Settings (tag validates against the live API)
- [ ] Deposit devnet SOL → balance credits, 0.5% fee shown
- [ ] Create a duel (≥ 0.5 SOL) → appears in the Arena
- [ ] Accept it from the second wallet
- [ ] **Play a real Clash Royale friendly match** → the cron settles it automatically (this doubles as the outstanding CR verification test)
- [ ] Winner's balance increases; both bells get notifications
- [ ] Withdraw → real devnet SOL lands in the wallet
- [ ] `/admin/treasury` shows correct solvency and profit figures
- [ ] `/design` returns **404** (production-gated)
- [ ] Raise a dispute → resolve it in `/admin/disputes` → funds move correctly

---

## When all of the above passes

Staging is green and you're ready for **Phase 3 (hardening)** and then **Phase 4 (mainnet)**. Do **not** point anything at mainnet until every box above is ticked.
