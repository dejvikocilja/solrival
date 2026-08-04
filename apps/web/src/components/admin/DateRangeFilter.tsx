"use client";

import { X } from "lucide-react";

/**
 * Date-range control shared by every admin list view.
 *
 * Native `<input type="date">` rather than a calendar dependency: fully
 * keyboard accessible, locale-aware for free, and on mobile it opens the OS
 * date wheel — better than any JS calendar we would ship. `[color-scheme:dark]`
 * makes the browser's built-in picker render dark rather than a white box.
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  label = "Created",
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  label?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const active = Boolean(from || to);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-caption uppercase tracking-wide text-faint">{label} from</span>
        <input
          type="date"
          value={from}
          max={to || today}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-fg [color-scheme:dark] focus-visible:focus-ring"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-caption uppercase tracking-wide text-faint">To</span>
        <input
          type="date"
          value={to}
          min={from || undefined}
          max={today}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-fg [color-scheme:dark] focus-visible:focus-ring"
        />
      </label>
      {active ? (
        <button
          type="button"
          onClick={() => onChange({ from: "", to: "" })}
          aria-label="Clear date filter"
          className="mb-0.5 inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-[13px] text-muted transition-colors hover:text-fg focus-visible:focus-ring"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      ) : null}
    </div>
  );
}
