import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, Prisma, type User, type WalletProvider } from "@solrival/db";
import { authConfig } from "./config";

/** Generates a collision-safe default username (user edits later in onboarding). */
function defaultUsername(walletAddress: string): string {
  const suffix = walletAddress.slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `rival-${suffix}${rand}`;
}

/** Short, shareable, URL-safe referral code (uppercase base32-ish). */
function generateReferralCode(): string {
  return randomBytes(5).toString("hex").toUpperCase(); // 10 chars
}

/**
 * Returns the user for a wallet, creating one on first login. Role is granted
 * from the admin allowlist (env), re-evaluated each login so allowlist changes
 * take effect. Username collisions retry with a fresh suffix.
 */
export async function findOrCreateUser(
  walletAddress: string,
  provider: WalletProvider,
): Promise<User> {
  const isAdmin = authConfig.adminAllowlist.includes(walletAddress);

  const existing = await prisma.user.findUnique({ where: { walletAddress } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        walletProvider: provider,
        role: isAdmin ? "ADMIN" : existing.role === "ADMIN" ? "ADMIN" : "PLAYER",
        lastSeenAt: new Date(),
      },
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          walletAddress,
          walletProvider: provider,
          username: defaultUsername(walletAddress),
          referralCode: generateReferralCode(),
          role: isAdmin ? "ADMIN" : "PLAYER",
          lastSeenAt: new Date(),
          balance: { create: {} }, // initialize the custodial balance row
        },
      });
    } catch (e) {
      // Unique violation on username/referral_code -> retry; on wallet -> someone
      // created it concurrently, so fetch and return that row.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = (e.meta?.target as string[] | undefined)?.join(",") ?? "";
        if (target.includes("wallet_address")) {
          const u = await prisma.user.findUnique({ where: { walletAddress } });
          if (u) return u;
        }
        continue; // username/referral_code clash -> new suffix
      }
      throw e;
    }
  }
  throw new Error("Failed to allocate a unique username after retries");
}
