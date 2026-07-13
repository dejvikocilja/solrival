import type { Metadata } from "next";
import { listDuelsQuerySchema } from "@solrival/shared";
import { getArena } from "@/server/services/duel/arena";
import { PageContainer, PageHeader } from "@/components/ui/page-shell";
import { ArenaControls } from "@/components/arena/arena-controls";
import { DuelGrid } from "@/components/arena/duel-grid";
import { ArenaEmptyState } from "@/components/arena/empty-state";

export const metadata: Metadata = {
  title: "Arena",
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

export default async function ArenaPage({
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
  const { duels } = await getArena(query);

  const isFiltered = FILTER_KEYS.some((k) => flat[k] != null);

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Live arena"
        title="Open duels"
        description="Pick a challenge, match the stake, and play. Funds stay in Solana escrow and the winner is paid out automatically."
      />

      <div className="mb-6">
        <ArenaControls resultCount={duels.length} />
      </div>

      {duels.length > 0 ? <DuelGrid duels={duels} /> : <ArenaEmptyState filtered={isFiltered} />}
    </PageContainer>
  );
}
