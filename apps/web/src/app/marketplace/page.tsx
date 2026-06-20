import type { Metadata } from "next";
import { listDuelsQuerySchema } from "@solrival/shared";
import { getMarketplace } from "@/server/services/duel/marketplace";
import { MarketplaceControls } from "@/components/marketplace/marketplace-controls";
import { DuelGrid } from "@/components/marketplace/duel-grid";
import { MarketplaceEmptyState } from "@/components/marketplace/empty-state";

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Browse open 1v1 duels and accept a challenge.",
};

export const dynamic = "force-dynamic";

const FILTER_KEYS = [
  "game",
  "minStakeLamports",
  "maxStakeLamports",
  "minTrophies",
  "maxTrophies",
  "minAccountLevel",
  "maxAccountLevel",
  "minWinRateBps",
];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") flat[k] = val;
  }

  // Invalid params should degrade to defaults, never error the page.
  const parsed = listDuelsQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : listDuelsQuerySchema.parse({});
  const { duels } = await getMarketplace(query);

  const isFiltered = FILTER_KEYS.some((k) => flat[k] != null);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
      {/* header */}
      <div className="mb-7 flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-rival">Live marketplace</span>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          Open duels
        </h1>
        <p className="max-w-xl text-sm text-muted">
          Pick a challenge, match the stake, and play. Funds stay in Solana escrow and the winner is
          paid out automatically.
        </p>
      </div>

      {/* controls */}
      <div className="mb-6">
        <MarketplaceControls resultCount={duels.length} />
      </div>

      {/* results */}
      {duels.length > 0 ? <DuelGrid duels={duels} /> : <MarketplaceEmptyState filtered={isFiltered} />}
    </main>
  );
}
