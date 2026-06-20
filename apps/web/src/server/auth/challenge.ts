import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@solrival/db";
import { NONCE_TTL_SECONDS } from "@solrival/shared";
import { buildSiwsMessage } from "./message";

/** Creates a single-use challenge and returns the exact message to be signed. */
export async function createChallenge(walletAddress: string): Promise<{
  nonce: string;
  message: string;
  expiresAt: Date;
}> {
  const nonce = randomBytes(24).toString("base64url");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_SECONDS * 1000);
  const message = buildSiwsMessage({ walletAddress, nonce, issuedAt, expiresAt });

  await prisma.authChallenge.create({
    data: { walletAddress, nonce, message, expiresAt },
  });

  return { nonce, message, expiresAt };
}

/**
 * Atomically claims a challenge: returns the stored message only if the nonce
 * exists, matches the wallet, is unexpired, and was not already consumed. The
 * conditional updateMany makes concurrent verify attempts race-safe (only one
 * claim succeeds), preventing replay.
 */
export async function consumeChallenge(
  walletAddress: string,
  nonce: string,
): Promise<{ message: string } | null> {
  const challenge = await prisma.authChallenge.findUnique({ where: { nonce } });
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.walletAddress !== walletAddress ||
    challenge.expiresAt.getTime() < Date.now()
  ) {
    return null;
  }

  const claimed = await prisma.authChallenge.updateMany({
    where: { nonce, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1) return null; // lost the race

  return { message: challenge.message };
}
