import type { MarketplaceDuel } from "@/server/services/duel/marketplace";
import { DuelCard } from "./duel-card";

export function DuelGrid({ duels }: { duels: MarketplaceDuel[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {duels.map((duel, i) => (
        <div key={duel.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <DuelCard duel={duel} />
        </div>
      ))}
    </div>
  );
}
