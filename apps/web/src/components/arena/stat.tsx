import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stat({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Icon className="h-4 w-4 shrink-0 text-faint" aria-hidden />
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight text-fg tabular">{value}</div>
        <div className="text-overline uppercase leading-tight text-faint">{label}</div>
      </div>
    </div>
  );
}
