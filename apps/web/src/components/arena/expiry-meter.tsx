"use client";
import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const WINDOW_MS = 30 * 60 * 1000; // duels expire 30 minutes after creation

function fmt(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The card's signature: a live countdown over the duel's 30-minute window.
 * The meter drains toward expiry; under 5 minutes it shifts to ember and
 * pulses (reduced-motion respected globally).
 */
export function ExpiryMeter({ expiresAt, className }: { expiresAt: string; className?: string }) {
  const expiry = React.useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = now == null ? expiry - (expiry - WINDOW_MS) : Math.max(0, expiry - now);
  const fraction = Math.max(0, Math.min(1, remaining / WINDOW_MS));
  const expired = now != null && remaining <= 0;
  const urgent = !expired && remaining <= 5 * 60 * 1000;

  const accent = expired ? "text-faint" : urgent ? "text-ember" : "text-muted";
  const bar = expired ? "bg-faint/40" : urgent ? "bg-ember" : "bg-rival";

  return (
    <div className={cn("space-y-1.5", className)} aria-live="off">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-faint">
          <Clock className={cn("h-3.5 w-3.5", urgent && !expired && "animate-ember-pulse")} aria-hidden />
          {expired ? "Expired" : "Expires in"}
        </span>
        <span className={cn("font-mono font-medium tabular", accent)} suppressHydrationWarning>
          {now == null ? "—:—" : fmt(remaining)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
        <div
          className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", bar)}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
