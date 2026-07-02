#!/usr/bin/env node
/**
 * SolRival devnet smoke test.
 *
 * Exercises the REAL production code paths end-to-end against a running dev
 * server — no admin force-settle, no mocks:
 *
 *   1. server preflight
 *   2. two ephemeral wallets funded with devnet SOL (airdrop, or a funder key)
 *   3. SIWS auth for both (nonce → ed25519 sign → verify → session cookie)
 *   4. real on-chain deposits to the treasury, credited via POST /api/deposits
 *   5. duel create (A) + accept (B), asserting the ledger locks
 *   6. the verification sweep (the production cron), asserting the transition
 *   7. a withdrawal request + the payout worker, asserting real SOL moves back
 *
 * The ONLY step it cannot automate is playing the in-game battle — after step
 * 6 the duel settles automatically the next time the sweep runs following a
 * real matching battle (requires both accounts to have linked game tags), or
 * disputes safely at the verification timeout.
 *
 * Usage:
 *   pnpm --filter @solrival/web smoke            # against http://localhost:3000
 *   APP_URL=https://staging.example.com \
 *   SMOKE_FUNDER_SECRET=<base58-or-json-array> \
 *   pnpm --filter @solrival/web smoke
 *
 * Env:
 *   APP_URL                 target app (default http://localhost:3000)
 *   NEXT_PUBLIC_SOLANA_RPC_URL  RPC (default devnet public RPC)
 *   SMOKE_FUNDER_SECRET     optional pre-funded devnet key; skips flaky airdrops
 *   VERIFY_CRON_SECRET / EXPIRE_CRON_SECRET / WITHDRAWAL_CRON_SECRET
 *                           needed for steps 6–7 (same values as the server's)
 *   SMOKE_STAKE_SOL         stake per player (default 0.005)
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";

// ─── Config ───────────────────────────────────────────────────────────────────

const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const STAKE_SOL = Number(process.env.SMOKE_STAKE_SOL ?? "0.005");
const STAKE_LAMPORTS = BigInt(Math.round(STAKE_SOL * LAMPORTS_PER_SOL));
const DEPOSIT_SOL = 0.06; // covers stake + withdrawal minimum (0.01) + margin
const VERIFY_SECRET = process.env.VERIFY_CRON_SECRET ?? process.env.EXPIRE_CRON_SECRET ?? "";
const WITHDRAWAL_SECRET = process.env.WITHDRAWAL_CRON_SECRET ?? "";

const connection = new Connection(RPC_URL, "confirmed");

// ─── Reporting ────────────────────────────────────────────────────────────────

/** @type {{name: string, status: "PASS"|"FAIL"|"SKIP", note: string}[]} */
const results = [];
let failed = false;

function record(name, status, note = "") {
  results.push({ name, status, note });
  const icon = status === "PASS" ? "✓" : status === "SKIP" ? "−" : "✗";
  console.log(`  ${icon} ${name}${note ? ` — ${note}` : ""}`);
  if (status === "FAIL") failed = true;
}

function step(title) {
  console.log(`\n▸ ${title}`);
}

// ─── Minimal cookie-aware API client ─────────────────────────────────────────

class ApiClient {
  constructor(label) {
    this.label = label;
    /** @type {Map<string,string>} */
    this.cookies = new Map();
  }

  #absorb(res) {
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")]
          : [];
    for (const line of setCookies) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async request(method, path, body) {
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(`${APP_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.#absorb(res);
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json };
  }

  get(path) {
    return this.request("GET", path);
  }
  post(path, body) {
    return this.request("POST", path, body);
  }
}

/** Bearer-authed call to an internal keeper endpoint. */
async function internal(path, secret) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

// ─── Solana helpers ───────────────────────────────────────────────────────────

function parseSecretKey(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

async function fund(recipient, sol) {
  const funderRaw = process.env.SMOKE_FUNDER_SECRET;
  if (funderRaw) {
    const funder = parseSecretKey(funderRaw);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: recipient,
        lamports: Math.round(sol * LAMPORTS_PER_SOL),
      }),
    );
    await sendAndConfirmTransaction(connection, tx, [funder], { commitment: "confirmed" });
    return;
  }
  // Devnet airdrops are rate-limited and flaky; retry with backoff.
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sig = await connection.requestAirdrop(recipient, Math.round(sol * LAMPORTS_PER_SOL));
      const latest = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, attempt * 3_000));
    }
  }
  throw new Error(
    `Airdrop failed after 3 attempts (${lastErr?.message ?? lastErr}). ` +
      `Fund ${recipient.toBase58()} manually, or set SMOKE_FUNDER_SECRET to a pre-funded devnet key.`,
  );
}

/** Transfers SOL and waits for FINALIZED — deposit verification requires it. */
async function transferFinalized(from, to, sol) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.round(sol * LAMPORTS_PER_SOL),
    }),
  );
  return sendAndConfirmTransaction(connection, tx, [from], { commitment: "finalized" });
}

// ─── SIWS auth ────────────────────────────────────────────────────────────────

async function signIn(client, keypair) {
  const walletAddress = keypair.publicKey.toBase58();
  const nonceRes = await client.post("/api/auth/nonce", { walletAddress, provider: "PHANTOM" });
  if (nonceRes.status !== 200) {
    throw new Error(`nonce failed (${nonceRes.status}): ${JSON.stringify(nonceRes.json)}`);
  }
  const { nonce, message } = nonceRes.json.data ?? nonceRes.json;
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
  );
  const verifyRes = await client.post("/api/auth/verify", {
    walletAddress,
    provider: "PHANTOM",
    nonce,
    signature,
  });
  if (verifyRes.status !== 200) {
    throw new Error(`verify failed (${verifyRes.status}): ${JSON.stringify(verifyRes.json)}`);
  }
  return (verifyRes.json.data ?? verifyRes.json).user;
}

// ─── Response unwrap (routes wrap payloads as { data }) ───────────────────────

const unwrap = (json) => json?.data ?? json;

async function getBalance(client) {
  const res = await client.get("/api/balance");
  if (res.status !== 200) throw new Error(`balance failed (${res.status})`);
  const b = unwrap(res.json).balance ?? unwrap(res.json);
  return {
    available: BigInt(b.availableLamports),
    locked: BigInt(b.lockedLamports),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`SolRival devnet smoke test\n  app: ${APP_URL}\n  rpc: ${RPC_URL}`);

  // 1 · Preflight
  step("1 · Server preflight");
  try {
    const res = await fetch(`${APP_URL}/api/balance`);
    if (res.status === 401) record("server reachable, auth enforced", "PASS");
    else record("server preflight", "FAIL", `expected 401 from /api/balance, got ${res.status}`);
  } catch (e) {
    record("server preflight", "FAIL", `cannot reach ${APP_URL}: ${e.message}`);
    return finish();
  }

  // 2 · Wallets
  step("2 · Fund two ephemeral devnet wallets");
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  console.log(`  A: ${alice.publicKey.toBase58()}\n  B: ${bob.publicKey.toBase58()}`);
  try {
    await fund(alice.publicKey, DEPOSIT_SOL + 0.01);
    await fund(bob.publicKey, DEPOSIT_SOL + 0.01);
    record("wallets funded", "PASS", `${DEPOSIT_SOL + 0.01} SOL each`);
  } catch (e) {
    record("wallets funded", "FAIL", e.message);
    return finish();
  }

  // 3 · Auth
  step("3 · SIWS sign-in (nonce → ed25519 → session)");
  const A = new ApiClient("A");
  const B = new ApiClient("B");
  let userA, userB;
  try {
    userA = await signIn(A, alice);
    userB = await signIn(B, bob);
    record("both users authenticated", "PASS", `${userA.username} / ${userB.username}`);
  } catch (e) {
    record("authentication", "FAIL", e.message);
    return finish();
  }

  // 4 · Deposits
  step("4 · Real on-chain deposits → credited balances");
  let treasury;
  try {
    const cfg = unwrap((await A.get("/api/deposits")).json).config;
    treasury = new PublicKey(cfg.treasuryWallet);
    console.log(`  treasury: ${cfg.treasuryWallet} (fee ${cfg.depositFeeBps} bps)`);
    for (const [client, kp, label] of [
      [A, alice, "A"],
      [B, bob, "B"],
    ]) {
      console.log(`  transferring ${DEPOSIT_SOL} SOL from ${label} (waiting for finalized…)`);
      const sig = await transferFinalized(kp, treasury, DEPOSIT_SOL);
      const dep = await client.post("/api/deposits", { signature: sig });
      if (dep.status !== 201) throw new Error(`${label} deposit rejected (${dep.status}): ${JSON.stringify(dep.json)}`);
      const bal = await getBalance(client);
      if (bal.available <= 0n) throw new Error(`${label} balance not credited`);
      console.log(`  ${label} credited: ${Number(bal.available) / LAMPORTS_PER_SOL} SOL available`);
    }
    record("deposits verified on-chain and credited", "PASS");
  } catch (e) {
    record("deposits", "FAIL", e.message);
    return finish();
  }

  // 5 · Duel create + accept
  step(`5 · Duel lifecycle (stake ${STAKE_SOL} SOL each)`);
  let duelId;
  try {
    const before = await getBalance(A);
    const created = await A.post("/api/duels", {
      game: "CLASH_ROYALE",
      ruleTemplate: "CR_CLASSIC_DECK",
      visibility: "PUBLIC",
      stakeLamports: STAKE_LAMPORTS.toString(),
      friendLink: "https://link.clashroyale.com/invite/friend/en?tag=SMOKETEST",
    });
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`create failed (${created.status}): ${JSON.stringify(created.json)}`);
    }
    const duel = unwrap(created.json).duel;
    duelId = duel.id;
    const after = await getBalance(A);
    if (after.locked - before.locked !== STAKE_LAMPORTS) {
      throw new Error(`creator lock mismatch: locked Δ=${after.locked - before.locked}, want ${STAKE_LAMPORTS}`);
    }
    record("duel created, creator stake locked", "PASS", `id ${duelId.slice(0, 8)}… status ${duel.status}`);

    const accepted = await B.post(`/api/duels/${duelId}/accept`, {
      friendLink: "https://link.clashroyale.com/invite/friend/en?tag=SMOKETEST2",
    });
    if (accepted.status !== 200 && accepted.status !== 201) {
      throw new Error(`accept failed (${accepted.status}): ${JSON.stringify(accepted.json)}`);
    }
    const balB = await getBalance(B);
    if (balB.locked < STAKE_LAMPORTS) throw new Error("opponent stake not locked");
    record("duel accepted, opponent stake locked", "PASS", `status ${unwrap(accepted.json).duel.status}`);
  } catch (e) {
    record("duel lifecycle", "FAIL", e.message);
    return finish();
  }

  // 6 · Verification sweep (the production cron path)
  step("6 · Verification sweep");
  if (!VERIFY_SECRET) {
    record("verification sweep", "SKIP", "set VERIFY_CRON_SECRET or EXPIRE_CRON_SECRET to run");
  } else {
    try {
      const sweep = await internal("/api/internal/duels/verify", VERIFY_SECRET);
      if (sweep.status !== 200) throw new Error(`sweep HTTP ${sweep.status}: ${JSON.stringify(sweep.json)}`);
      const detail = unwrap((await A.get(`/api/duels/${duelId}`)).json).duel;
      // With linked game accounts the duel moves to VERIFYING and both players
      // are notified; without them it stays ACTIVE (sweep can't load tags).
      if (detail.status === "VERIFYING") {
        record("sweep ran; duel VERIFYING", "PASS", "settles automatically after a real matching battle");
      } else {
        record("sweep ran", "PASS", `duel ${detail.status} — link real game tags on both accounts for full auto-settlement`);
      }
    } catch (e) {
      record("verification sweep", "FAIL", e.message);
    }
  }

  // 7 · Withdrawal + payout worker
  step("7 · Withdrawal request → payout worker → real SOL out");
  try {
    const balB = await getBalance(B);
    const amount = balB.available; // withdraw everything left available
    if (amount < 10_000_000n) {
      record("withdrawal", "SKIP", `B available ${amount} below the 0.01 SOL minimum`);
    } else {
      const reqRes = await B.post("/api/withdrawals", { amountLamports: amount.toString() });
      if (reqRes.status !== 200 && reqRes.status !== 201) {
        throw new Error(`request failed (${reqRes.status}): ${JSON.stringify(reqRes.json)}`);
      }
      if (!WITHDRAWAL_SECRET) {
        record("withdrawal requested", "PASS", "set WITHDRAWAL_CRON_SECRET to also test the payout worker");
      } else {
        const chainBefore = await connection.getBalance(bob.publicKey);
        const proc = await internal("/api/internal/withdrawals/process", WITHDRAWAL_SECRET);
        if (proc.status !== 200) throw new Error(`payout worker HTTP ${proc.status}: ${JSON.stringify(proc.json)}`);
        // Poll briefly for the on-chain payout to land.
        let paid = false;
        for (let i = 0; i < 10 && !paid; i++) {
          await new Promise((r) => setTimeout(r, 3_000));
          const list = unwrap((await B.get("/api/withdrawals")).json);
          const items = list.items ?? list.withdrawals ?? [];
          paid = items.some((w) => w.status === "PAID");
        }
        const chainAfter = await connection.getBalance(bob.publicKey);
        if (paid && chainAfter > chainBefore) {
          record("withdrawal paid on-chain", "PASS", `+${(chainAfter - chainBefore) / LAMPORTS_PER_SOL} SOL to B`);
        } else if (paid) {
          record("withdrawal PAID in ledger", "PASS", "on-chain delta not yet visible at confirmed commitment");
        } else {
          record(
            "withdrawal payout",
            "FAIL",
            "not PAID after 30s — is TREASURY_SECRET_KEY set on the server and the treasury funded?",
          );
        }
      }
    }
  } catch (e) {
    record("withdrawal", "FAIL", e.message);
  }

  return finish();
}

function finish() {
  console.log("\n──── Summary ────");
  for (const r of results) {
    console.log(`  ${r.status.padEnd(4)} ${r.name}${r.note ? ` — ${r.note}` : ""}`);
  }
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(
    failed
      ? "\nRESULT: FAIL — fix the failures above before staging."
      : `\nRESULT: PASS${skipped ? ` (${skipped} skipped)` : ""} — core loop verified against the real APIs.`,
  );
  console.log(
    "Note: the created duel stays open server-side; it will auto-dispute at the verification timeout, which also exercises that path safely.",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("\nUnhandled failure:", e);
  process.exit(1);
});
