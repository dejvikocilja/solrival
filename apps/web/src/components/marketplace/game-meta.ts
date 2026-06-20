export type GameKey = "CLASH_ROYALE" | "BRAWL_STARS";

export const GAME_META: Record<GameKey, {
  label: string;
  short: string;
  badgeTone: "cr" | "bs";
  rail: string;
  ring: string;
}> = {
  CLASH_ROYALE: { label: "Clash Royale", short: "CR", badgeTone: "cr", rail: "bg-cr", ring: "ring-cr/40" },
  BRAWL_STARS: { label: "Brawl Stars", short: "BS", badgeTone: "bs", rail: "bg-bs", ring: "ring-bs/40" },
};
