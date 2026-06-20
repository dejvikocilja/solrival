# SolRival — Repository Structure

A full breakdown of the `solrival/` monorepo. A **monorepo** is one repository
holding several related projects that share code. Everything is organized into
four top-level areas:

- `apps/` — things that actually run (the website + its API)
- `packages/` — shared code those apps import, so logic lives in one place
- `programs/` — the Solana smart contract (Rust/Anchor)
- `docs/` — documentation

> **Next.js routing note:** the web app uses *folder-based routing* — the folder
> path *is* the URL, and the file inside declares its type: `page.tsx` = a web
> page, `route.ts` = an API endpoint, `loading.tsx` = a loading spinner. That is
> why many identically-named files exist in different folders; each one is a
> different page/endpoint, not a duplicate.

---

## Root level — workspace config

| Path | Purpose |
|---|---|
| `package.json` | Workspace definition + top-level scripts (dev, build, typecheck) |
| `pnpm-workspace.yaml` | Tells pnpm which folders are sub-projects (`apps/*`, `packages/*`) |
| `turbo.json` | Build orchestration — runs tasks across sub-projects in order |
| `tsconfig.base.json` | Shared TypeScript settings every project inherits |
| `.nvmrc` | Pins the Node.js version (20.18) |
| `.prettierrc.json` | Code formatting rules |
| `.env.example` | Template listing every environment variable you must set |
| `.gitignore` | Files git must never commit (secrets, node_modules, build output) |
| `.github/workflows/ci.yml` | Automated checks that run on every push |

---

## `apps/web/` — the Next.js website + API (the main app)

The actual product users visit. Config files at the root (`next.config.ts`,
`tailwind.config.ts`, `tsconfig.json`, `package.json`, `public/`), with all code
under `src/`:

### `src/app/` — URLs (pages + API endpoints)

- `page.tsx`, `layout.tsx`, `globals.css` — homepage, shared frame, global styles
- `marketplace/` — `/marketplace` (browse open duels)
- `wallet/` — `/wallet` (deposit / withdraw / balance)
- `(app)/duels/create/` — the "create a duel" page
- `admin/` — the full admin dashboard (`/admin/*`): analytics, disputes, duels,
  tournaments, verification, withdrawals — each its own page
- `api/` — every backend endpoint (the `route.ts` files):
  - `auth/` — sign in with a Solana wallet (nonce, verify, session, logout)
  - `duels/` — create / list / accept / cancel / confirm duels
  - `tournaments/` — list / view / register
  - `deposits/`, `withdrawals/`, `balance/`, `users/me/` — money + account
  - `admin/` — admin-only endpoints (mirror the admin pages)
  - `internal/` — cron/keeper jobs (expire duels, verify results, pay withdrawals)
  - `realtime/` — live updates (server-sent events)

### `src/components/` — reusable UI pieces

Buttons, cards, modals, tables, grouped by area: `admin/`, `credits/`, `duel/`,
`marketplace/`, `notifications/`, `providers/`, `ui/`.

### `src/hooks/` — reusable front-end logic

`use-create-duel`, `use-auth`, `useCredits`, `useDuel`, `useNotifications`,
`useRealtimeEvents`.

### `src/lib/` — front-end helpers

`api/` (API client), `env.ts`, `realtime/` (live event plumbing),
`solana/` (wallet provider), `verification/` (Supercell battle-log checking),
`utils.ts`.

### `src/server/` — back-end logic (never runs in the browser)

- `auth/` — session tokens, signature verification, admin checks
- `guards/` — security gates (rate-limit, CSRF origin, internal-auth, uuid)
- `http/` — shared API response formatting
- `services/` — the real business logic:
  - `credits/` — the balance ledger (the economic core)
  - `duel/` — duel lifecycle: create → accept → settle
  - `tournament/` — tournament engine (brackets, prizes)
  - `deposit/`, `withdrawal/`, `referral/`
- `solana/` — treasury wallet + on-chain config

`src/middleware.ts` runs on every request (gates `/admin`, forwards identity).
`src/types/` holds shared TypeScript type definitions.

---

## `packages/` — shared code the apps import

Not run directly; libraries the web app (and contract tests) pull in.

| Package | Purpose |
|---|---|
| `db/` | The database: Prisma schema (all tables), migrations, seed data, and the query client |
| `shared/` | Code shared between front-end and back-end: validation schemas, state machines, enums, constants |
| `sdk/` | TypeScript client for the Solana smart contract (encoding instructions, deriving addresses, the program id) |
| `config/` | Shared ESLint / Tailwind / TypeScript presets |

---

## `programs/solrival-escrow/` — the Solana smart contract (Rust/Anchor)

The on-chain escrow program. This is the legacy/optional path — the live money
flow is the custodial credits ledger — kept as scaffolding.

- `Anchor.toml`, `Cargo.toml`, `package.json` — build config
- `solrival-program.keypair.json` — the program's signing key (gitignored; deploy with it)
- `tests/solrival-escrow.ts` — automated contract tests
- `programs/solrival-escrow/src/`:
  - `lib.rs` — entry point (declares the 6 instructions)
  - `instructions/` — one file per on-chain action: `create_duel_escrow`,
    `deposit_stake`, `finalize_payout`, `refund_expired`, `flag_dispute`,
    `resolve_dispute`
  - `state/`, `constants.rs`, `errors.rs`, `events.rs`, `util.rs` — supporting code

---

## `docs/` — documentation

| File | Purpose |
|---|---|
| `README.md` | Project overview |
| `DEPLOYMENT.md` | How to deploy |
| `STRUCTURE.md` | This file |
| `ADR-0001-verification-feasibility.md` | Design decision record |
| `AUDIT-2026-06-17.md` | The full audit + everything fixed |

---

*Empty placeholder folders (`.gitkeep`) have been removed — every folder in the
tree now contains real code or config.*
