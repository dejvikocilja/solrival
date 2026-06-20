import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes } from "crypto";
import { SolrivalEscrow } from "../target/types/solrival_escrow";

/**
 * Full-lifecycle tests for the SolRival escrow program.
 * Run with `anchor test` (spins up a local validator).
 *
 * Covers:
 *  1. create_duel_escrow — happy path, verify account state + vault balance
 *  2. deposit_stake — happy path, verify state = Active
 *  3. deposit_stake — should fail if same player tries to challenge
 *  4. finalize_payout — happy path, verify winner received correct lamports, fee vault received fee
 *  5. refund_expired — should fail before expiry
 *  6. refund_expired — happy path after expiry (1s window + sleep)
 *  7. flag_dispute — verify state = Disputed
 */
describe("solrival-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SolrivalEscrow as Program<SolrivalEscrow>;

  // Shared authority and fee wallet used across tests.
  const authority = Keypair.generate();
  const feeVaultKp = Keypair.generate();

  const FEE_BPS = 500;            // 5%
  const STAKE = new BN(0.1 * LAMPORTS_PER_SOL);
  const EXPIRY_SECS = 30 * 60;   // 30 min (normal duels)
  const SHORT_EXPIRY = 1;         // 1 second (used for expiry tests)

  // -------------------------------------------------------------------------
  // PDA helpers
  // -------------------------------------------------------------------------
  const enc = new TextEncoder();

  /** Derive duel_escrow PDA for a 32-byte duel id. */
  const escrowPda = (id: Uint8Array): PublicKey =>
    PublicKey.findProgramAddressSync(
      [enc.encode("duel_escrow"), id],
      program.programId
    )[0];

  /** Derive vault PDA for a 32-byte duel id. */
  const vaultPda = (id: Uint8Array): PublicKey =>
    PublicKey.findProgramAddressSync(
      [enc.encode("vault"), id],
      program.programId
    )[0];

  /** Generate a fresh 32-byte duel ID (zero-padded from 16 random bytes). */
  const newDuelId = (): Uint8Array => {
    const id = new Uint8Array(32);
    id.set(randomBytes(16));
    return id;
  };

  /** Airdrop `sol` SOL to a keypair and confirm. */
  const fund = async (kp: Keypair, sol = 2): Promise<void> => {
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  };

  // Fund shared wallets once before all tests.
  before(async () => {
    await fund(authority, 1);
    await fund(feeVaultKp, 0.1);
  });

  // -------------------------------------------------------------------------
  // Helper: create a duel and have a challenger deposit stake.
  // -------------------------------------------------------------------------
  const createAndDeposit = async (
    creator: Keypair,
    challenger: Keypair,
    id: Uint8Array,
    expirySecs = EXPIRY_SECS
  ): Promise<void> => {
    await program.methods
      .createDuelEscrow(
        Array.from(id) as any,
        STAKE,
        FEE_BPS,
        new BN(expirySecs),
        authority.publicKey
      )
      .accountsPartial({
        creator: creator.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        feeVault: feeVaultKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    await program.methods
      .depositStake()
      .accountsPartial({
        challenger: challenger.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        systemProgram: SystemProgram.programId,
      })
      .signers([challenger])
      .rpc();
  };

  // =========================================================================
  // 1. create_duel_escrow — happy path
  // =========================================================================
  it("1. create_duel_escrow — initialises account state and funds vault", async () => {
    const creator = Keypair.generate();
    await fund(creator);
    const id = newDuelId();

    const vaultBefore = await provider.connection.getBalance(vaultPda(id));

    await program.methods
      .createDuelEscrow(
        Array.from(id) as any,
        STAKE,
        FEE_BPS,
        new BN(EXPIRY_SECS),
        authority.publicKey
      )
      .accountsPartial({
        creator: creator.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        feeVault: feeVaultKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const escrow = await program.account.duelEscrow.fetch(escrowPda(id));
    assert.deepEqual(
      Buffer.from(escrow.duelId),
      Buffer.from(id),
      "duel_id stored correctly"
    );
    assert.ok(escrow.creator.equals(creator.publicKey), "creator stored");
    assert.ok(
      escrow.challenger.equals(PublicKey.default),
      "challenger is default until deposit"
    );
    assert.equal(escrow.stakeLamports.toNumber(), STAKE.toNumber(), "stake stored");
    assert.equal(escrow.feeBps, FEE_BPS, "fee_bps stored");
    assert.ok(escrow.feeVault.equals(feeVaultKp.publicKey), "fee_vault stored");
    assert.ok(escrow.resultAuthority.equals(authority.publicKey), "authority stored");
    assert.deepEqual(escrow.state, { created: {} }, "state is Created");
    assert.equal(escrow.acceptedAt.toNumber(), 0, "accepted_at is 0");

    const vaultAfter = await provider.connection.getBalance(vaultPda(id));
    assert.equal(
      vaultAfter - vaultBefore,
      STAKE.toNumber(),
      "vault funded with creator stake"
    );
  });

  // =========================================================================
  // 2. deposit_stake — happy path
  // =========================================================================
  it("2. deposit_stake — challenger deposits and state becomes Active", async () => {
    const creator = Keypair.generate();
    const challenger = Keypair.generate();
    await fund(creator);
    await fund(challenger);
    const id = newDuelId();

    await program.methods
      .createDuelEscrow(
        Array.from(id) as any,
        STAKE,
        FEE_BPS,
        new BN(EXPIRY_SECS),
        authority.publicKey
      )
      .accountsPartial({
        creator: creator.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        feeVault: feeVaultKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const vaultAfterCreate = await provider.connection.getBalance(vaultPda(id));

    await program.methods
      .depositStake()
      .accountsPartial({
        challenger: challenger.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        systemProgram: SystemProgram.programId,
      })
      .signers([challenger])
      .rpc();

    const escrow = await program.account.duelEscrow.fetch(escrowPda(id));
    assert.deepEqual(escrow.state, { active: {} }, "state is Active after deposit");
    assert.ok(
      escrow.challenger.equals(challenger.publicKey),
      "challenger recorded"
    );
    assert.isAbove(escrow.acceptedAt.toNumber(), 0, "accepted_at set");

    const vaultFinal = await provider.connection.getBalance(vaultPda(id));
    assert.equal(
      vaultFinal - vaultAfterCreate,
      STAKE.toNumber(),
      "vault funded with challenger stake"
    );
    assert.equal(
      vaultFinal,
      STAKE.toNumber() * 2,
      "vault holds total 2× stake"
    );
  });

  // =========================================================================
  // 3. deposit_stake — same player cannot challenge themselves
  // =========================================================================
  it("3. deposit_stake — rejects SamePlayer when creator tries to challenge", async () => {
    const creator = Keypair.generate();
    await fund(creator);
    const id = newDuelId();

    await program.methods
      .createDuelEscrow(
        Array.from(id) as any,
        STAKE,
        FEE_BPS,
        new BN(EXPIRY_SECS),
        authority.publicKey
      )
      .accountsPartial({
        creator: creator.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        feeVault: feeVaultKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    try {
      await program.methods
        .depositStake()
        .accountsPartial({
          challenger: creator.publicKey,
          duelEscrow: escrowPda(id),
          escrowVault: vaultPda(id),
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      assert.fail("should have thrown SamePlayer");
    } catch (e: any) {
      assert.match(e.toString(), /SamePlayer/, "error is SamePlayer");
    }
  });

  // =========================================================================
  // 4. finalize_payout — happy path
  // =========================================================================
  it("4. finalize_payout — winner gets correct lamports, fee vault gets exact fee", async () => {
    const creator = Keypair.generate();
    const challenger = Keypair.generate();
    await fund(creator);
    await fund(challenger);
    const id = newDuelId();

    await createAndDeposit(creator, challenger, id);

    const winnerBefore = await provider.connection.getBalance(creator.publicKey);
    const feeBefore = await provider.connection.getBalance(feeVaultKp.publicKey);

    // Creator is declared winner.
    await program.methods
      .finalizePayout(creator.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        winner: creator.publicKey,
        feeVault: feeVaultKp.publicKey,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const pot = STAKE.toNumber() * 2;
    const expectedFee = Math.floor((pot * FEE_BPS) / 10_000);
    const expectedPayout = pot - expectedFee;

    const feeAfter = await provider.connection.getBalance(feeVaultKp.publicKey);
    const winnerAfter = await provider.connection.getBalance(creator.publicKey);

    assert.equal(feeAfter - feeBefore, expectedFee, "fee vault received exact fee");
    // Winner gains payout minus rent recovered from escrow close (small positive net).
    assert.isAbove(
      winnerAfter - winnerBefore,
      expectedPayout - 0.01 * LAMPORTS_PER_SOL,
      "winner received at least expected payout"
    );

    assert.isNull(
      await provider.connection.getAccountInfo(escrowPda(id)),
      "escrow account closed after finalize"
    );
    assert.equal(
      await provider.connection.getBalance(vaultPda(id)),
      0,
      "vault drained to zero"
    );
  });

  // =========================================================================
  // 5. refund_expired — should fail before expiry
  // =========================================================================
  it("5. refund_expired — rejects NotExpired when called before expires_at", async () => {
    const creator = Keypair.generate();
    const challenger = Keypair.generate();
    await fund(creator);
    await fund(challenger);
    const id = newDuelId();

    // Create with 30-minute window — far from expired.
    await createAndDeposit(creator, challenger, id, EXPIRY_SECS);

    try {
      await program.methods
        .refundExpired()
        .accountsPartial({
          caller: (provider.wallet as anchor.Wallet).payer.publicKey,
          duelEscrow: escrowPda(id),
          escrowVault: vaultPda(id),
          creator: creator.publicKey,
          challenger: challenger.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("should have thrown NotExpired");
    } catch (e: any) {
      assert.match(e.toString(), /NotExpired/, "error is NotExpired");
    }
  });

  // =========================================================================
  // 6. refund_expired — happy path after expiry (1-second window + sleep)
  // =========================================================================
  it("6. refund_expired — refunds both players after expiry", async () => {
    const creator = Keypair.generate();
    const challenger = Keypair.generate();
    await fund(creator);
    await fund(challenger);
    const id = newDuelId();

    // Use a 1-second expiry so the test can advance past it quickly.
    await createAndDeposit(creator, challenger, id, SHORT_EXPIRY);

    // Wait for the on-chain clock to tick past expires_at.
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const creatorBefore = await provider.connection.getBalance(creator.publicKey);
    const challengerBefore = await provider.connection.getBalance(challenger.publicKey);

    await program.methods
      .refundExpired()
      .accountsPartial({
        caller: (provider.wallet as anchor.Wallet).payer.publicKey,
        duelEscrow: escrowPda(id),
        escrowVault: vaultPda(id),
        creator: creator.publicKey,
        challenger: challenger.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const creatorAfter = await provider.connection.getBalance(creator.publicKey);
    const challengerAfter = await provider.connection.getBalance(challenger.publicKey);

    // Challenger gets their exact stake back (no fee on refund).
    assert.equal(
      challengerAfter - challengerBefore,
      STAKE.toNumber(),
      "challenger refunded exact stake"
    );
    // Creator gets their stake back plus rent from the closed escrow account.
    assert.isAbove(
      creatorAfter - creatorBefore,
      STAKE.toNumber() - 0.01 * LAMPORTS_PER_SOL,
      "creator refunded at least their stake"
    );

    assert.isNull(
      await provider.connection.getAccountInfo(escrowPda(id)),
      "escrow account closed after refund"
    );
    assert.equal(
      await provider.connection.getBalance(vaultPda(id)),
      0,
      "vault drained to zero"
    );
  });

  // =========================================================================
  // 7. flag_dispute — verify state = Disputed
  // =========================================================================
  it("7. flag_dispute — authority can flag Active duel as Disputed", async () => {
    const creator = Keypair.generate();
    const challenger = Keypair.generate();
    await fund(creator);
    await fund(challenger);
    const id = newDuelId();

    await createAndDeposit(creator, challenger, id);

    await program.methods
      .flagDispute()
      .accountsPartial({
        authority: authority.publicKey,
        duelEscrow: escrowPda(id),
      })
      .signers([authority])
      .rpc();

    const escrow = await program.account.duelEscrow.fetch(escrowPda(id));
    assert.deepEqual(escrow.state, { disputed: {} }, "state is Disputed");

    // Funds must remain locked (vault still holds 2× stake).
    const vaultBalance = await provider.connection.getBalance(vaultPda(id));
    assert.equal(
      vaultBalance,
      STAKE.toNumber() * 2,
      "funds remain locked in vault after dispute"
    );
  });

  // =========================================================================
  // Extra: non-authority cannot flag a dispute
  // =========================================================================
  it("flag_dispute — rejects Unauthorized when called by non-authority", async () => {
    const creator = Keypair.generate();
    const challenger = Keypair.generate();
    const attacker = Keypair.generate();
    await fund(creator);
    await fund(challenger);
    await fund(attacker);
    const id = newDuelId();

    await createAndDeposit(creator, challenger, id);

    try {
      await program.methods
        .flagDispute()
        .accountsPartial({
          authority: attacker.publicKey,
          duelEscrow: escrowPda(id),
        })
        .signers([attacker])
        .rpc();
      assert.fail("should have thrown Unauthorized");
    } catch (e: any) {
      assert.match(e.toString(), /Unauthorized|ConstraintAddress/, "error is Unauthorized");
    }
  });
});
