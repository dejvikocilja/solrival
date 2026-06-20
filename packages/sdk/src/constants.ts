/** Mirrors on-chain constants in programs/solrival-escrow. Keep in sync. */
export const CONFIG_SEED = "config";
export const ESCROW_SEED = "escrow";
export const VAULT_SEED = "vault";

export const BPS_DENOMINATOR = 10_000n;
export const MAX_FEE_BPS = 1_000;                  // 10% ceiling
export const DUEL_VALIDITY_WINDOW_SECS = 30 * 60;  // 30 minutes
export const MIN_STAKE_LAMPORTS = 1_000_000n;      // 0.001 SOL

/** Dedicated program id (keypair: programs/solrival-escrow/solrival-program.keypair.json).
 *  Matches declare_id! in the on-chain program. Client also accepts an explicit id. */
export const DEFAULT_PROGRAM_ID = "HA38xW46mB8J6ZNdL3NAjRbJamDMGLoo4Eq6bJdU7W23";
