import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { SESSION_TTL_SECONDS } from "@solrival/shared";
import { jwtSecretKey } from "./config";

/**
 * Stateless session token. Verification is edge-safe (jose uses WebCrypto), so
 * middleware can gate routes without a DB call. Authoritative checks
 * (suspension, role changes) are re-validated in Node route handlers via the DB.
 */

export interface SessionClaims extends JWTPayload {
  sub: string; // user id
  wallet: string;
  role: "PLAYER" | "ADMIN";
}

export async function signSession(claims: {
  userId: string;
  wallet: string;
  role: "PLAYER" | "ADMIN";
}): Promise<string> {
  return new SignJWT({ wallet: claims.wallet, role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(jwtSecretKey);
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, jwtSecretKey, {
      algorithms: ["HS256"],
    });
    if (!payload.sub || !payload.wallet || !payload.role) return null;
    return payload;
  } catch {
    return null; // expired, tampered, or malformed
  }
}
