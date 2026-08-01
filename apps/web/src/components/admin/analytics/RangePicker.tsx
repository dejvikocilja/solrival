"use client";

import { useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type RangePreset,
  type RangeSelection,
  PRESET_LABELS,
  RANGE_PRESETS,
  parseIsoDate,
  toIsoDate,
} from "@/lib/admin/analytics-range";

/**
 * Preset chips plus an optional custom window.
 *
 * Native `<input type="date">` rather than a calendar dependency: it is fully
 * keyboard accessible, localises itself, and on mobile opens the OS date wheel,
 * which beats any JS calendar we would ship. Styled to match the dark surface.
 */
export function RangePicker({
  value,
  onChange,
  disabled,
}: {
  value: RangeSelection;
  onChange: (next: RangeSelection) => void;
  disabled?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(value.kind === "custom");
  const [from, setFrom] = useState(value.kind === "custom" ? value.from : "");
  const [to, setTo] = useState(value.kind === "custom" ? value.to : toIsoDate(new Date()));

  // Keep local inputs in step when the range changes elsewhere (URL, back button).
  useEffect(() => {
    if (value.kind === "custom") {
      setCustomOpen(true);
      setFrom(value.from);
      setTo(value.to);
    }
  }, [value]);

  const today = toIsoDate(new Date());
  const validCustom =
    Boolean(parseIsoDate(from)) && Boolean(parseIsoDate(to)) && from <= to && to <= today;
  const customError =
    from && to && from > to
      ? "Start date must be before end date"
      : to && to > today
        ? "End date can't be in the future"
        : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGE_PRESETS.map((preset) => {
          const active = value.kind === "preset" && value.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => {
                setCustomOpen(false);
                onChange({ kind: "preset", preset: preset as RangePreset });
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:focus-ring disabled:opacity-50",
                active
                  ? "border-rival/40 bg-rival/12 text-rival"
                  : "border-border bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {PRESET_LABELS[preset]}
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          aria-pressed={value.kind === "custom"}
          onClick={() => setCustomOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:focus-ring disabled:opacity-50",
            value.kind === "custom"
              ? "border-rival/40 bg-rival/12 text-rival"
              : "border-border bg-surface-2 text-muted hover:text-fg",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Custom
        </button>
      </div>

      {customOpen ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption uppercase tracking-wide text-faint">From</span>
            <input
              type="date"
              value={from}
              max={to || today}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-body-sm text-fg focus-visible:focus-ring [color-scheme:dark]"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption uppercase tracking-wide text-faint">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-body-sm text-fg focus-visible:focus-ring [color-scheme:dark]"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!validCustom || disabled}
              onClick={() => onChange({ kind: "custom", from, to })}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCustomOpen(false);
                onChange({ kind: "preset", preset: "30d" });
              }}
              aria-label="Clear custom range"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {customError ? (
            <p className="text-caption text-danger sm:w-full" role="alert">
              {customError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
