/**
 * Wire types for the admin analytics endpoint.
 *
 * Kept out of the service module so client components can import them without
 * pulling `server-only` (and Prisma) into the browser bundle.
 */
import type { Bucket } from "./analytics-range";

export interface SeriesPoint {
  date: string; // ISO yyyy-mm-dd — the bucket's start
  count: number;
}
export interface VolumePoint {
  date: string;
  sol: number;
}

export interface AnalyticsSnapshot {
  /** Echoed back so the client can confirm what the numbers describe. */
  range: { from: string; to: string; bucket: Bucket; label: string };
  /** Scoped to the selected range. */
  duels: number;
  volumeSol: number;
  feesSol: number;
  tournaments: number;
  activePlayers: number;
  /** Live regardless of range — an in-flight duel has no date filter. */
  activeDuels: number;
  /** Lifetime figures, always shown alongside the scoped ones. */
  lifetime: { duels: number; volumeSol: number; feesSol: number };
  duelsPerDay: SeriesPoint[];
  volumePerDay: VolumePoint[];
  playersPerDay: SeriesPoint[];
  gameSplit: { game: string; matches: number }[];
}
