import { cn } from "@/lib/utils";
import { lamportsToSol } from "@/lib/utils";

/** Renders a lamports value as a precise, mono SOL figure (fintech feel). */
export function SolAmount({
  lamports,
  className,
  glyphClassName,
}: {
  lamports: string | bigint;
  className?: string;
  glyphClassName?: string;
}) {
  return (
    <span className={cn("tabular font-mono", className)}>
      <span className={cn("mr-0.5 opacity-70", glyphClassName)} aria-hidden>
        ◎
      </span>
      {lamportsToSol(lamports)}
    </span>
  );
}
