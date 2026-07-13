import type { ArenaDuel } from "@/server/services/duel/arena";
import { DuelCard } from "./duel-card";

export function DuelGrid({ duels }: { duels: ArenaDuel[] }) {
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
