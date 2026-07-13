import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formats lamports (bigint or numeric string) to a trimmed SOL string. */
export function lamportsToSol(lamports: bigint | string, maxFractionDigits = 4): string {
  const n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  const sol = Number(n) / 1_000_000_000;
  return sol.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

/** 4250 -> "4,250"; null -> "—" */
export function formatInt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

/** 5500 bps -> "55%" */
/**
 * Basis points → human percent. Must NOT round to whole numbers: 50 bps is
 * 0.5%, and Math.round would have displayed it as "1%" — misstating a fee we
 * actually charge. Trailing zeros are trimmed, so 500 → "5%", 50 → "0.5%",
 * 25 → "0.25%".
 */
export function bpsToPercent(bps: number | null | undefined): string {
  if (bps == null) return "—";
  const pct = bps / 100;
  return `${Number(pct.toFixed(2))}%`;
}

/**
 * Parses a decimal SOL string (e.g. "1.25") to a lamports BigInt, rounding to
 * the nearest lamport. Returns null for invalid / non-positive input.
 */
export function solToLamports(sol: string): bigint | null {
  const trimmed = sol.trim();
  if (!/^\d*(\.\d+)?$/.test(trimmed) || trimmed === "" || trimmed === ".") return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "000000000").slice(0, 9); // 9 decimals = 1 SOL
  const lamports = BigInt(whole || "0") * 1_000_000_000n + BigInt(fracPadded || "0");
  return lamports > 0n ? lamports : null;
}
