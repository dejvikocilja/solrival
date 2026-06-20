# ADR-0001: Automated verification via Supercell APIs — feasibility & risk

## Status
Accepted (with flagged risk to validate in build step 7).

## Context
The spec mandates fully automated, no-screenshot verification by reading
official battle records. This hinges on the Supercell Clash Royale and
Brawl Stars APIs.

## Known constraints (must validate against live tokens early)
1. **IP whitelisting** — API tokens bind to fixed source IPs. The verifier must
   run on a static-egress host (Railway/Fly/Render), not Vercel. (Drives the
   separate-service architecture.)
2. **No webhooks** — battle logs are pull-only. We poll per active duel within
   the 30-min window, with backoff and rate-limit budgeting.
3. **Battle-log retention & latency** — recent battles only, and a result can
   take time to appear. The verifier retries across the validity window before
   declaring `VERIFICATION_FAILURE`.
4. **Friendly-battle coverage** — not every private/friendly mode is guaranteed
   to surface in the battle log with the fields we need (mode, participants,
   timestamp, outcome). This is the single biggest product risk.

## Decision
Build the verifier behind a `GameProvider` interface so each game/mode is a
pluggable, independently testable resolver. Gate each supported rule template on
a real battle-log probe before enabling it in production.

## Mitigation if a mode is unverifiable
If a mode cannot be deterministically resolved from the battle log, do NOT fall
back to user-reported results (violates the no-honesty principle). Instead:
disable that template, or route to `Disputed` → admin review. Funds stay in
escrow until `settle` or `refund` — never auto-released on ambiguous data.

## Consequence
Validate live battle-log payloads for all 7 templates (4 CR + 3 BS) at the start
of build step 7, before wiring settlement.
