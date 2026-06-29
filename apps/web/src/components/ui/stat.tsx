import { cn } from "@/lib/utils";
import { Card, CardContent } from "./card";

/**
 * A single labelled metric (wins, win rate, pot size, …). Drop several into a
 * grid for a record/stats strip. `accent` colours the value (e.g. text-victory
 * for wins, text-danger for losses).
 */
export function Stat({
  label,
  value,
  accent = "text-fg",
  className,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 text-center">
        <p className="text-overline uppercase text-faint">{label}</p>
        <p className={cn("mt-1 text-heading-2 tabular", accent)}>{value}</p>
      </CardContent>
    </Card>
  );
}
